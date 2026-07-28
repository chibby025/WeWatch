// src/components/Games/SnakesAndLaddersGame.jsx
import { useState, useEffect } from 'react';
import { X as CloseIcon, Users } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors snakes_ladders.go's snakeLadders map exactly — used only for the
// board's visual labeling (🐍/🪜 icons), never for move validation, which the
// server owns entirely.
const SNAKES_LADDERS = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91, // ladders (up)
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78, // snakes (down)
};

const TOKEN_EMOJI = ['🔴', '🔵', '🟢', '🟡'];

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

export default function SnakesAndLaddersGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [positions, setPositions] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [lastRoll, setLastRoll] = useState(null);
  const [winner, setWinner] = useState(null);
  const [isOver, setIsOver] = useState(false);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    setPositions(gs.positions || players.map(() => 0));
    setCurrentTurn(gameState.current_turn ?? 0);
    setLastRoll(typeof gs.last_roll === 'number' ? gs.last_roll : null);
    setRolling(false);

    const over = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';
    setIsOver(over);
    if (over) {
      setWinner(gameState.winner_id ? (players.find(p => p.user_id === gameState.winner_id) || 'draw') : 'draw');
    } else {
      setWinner(null);
    }
  }, [gameState, players]);

  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId && !isOver;

  const handleRoll = () => {
    if (!isMyTurn || rolling) return;
    setRolling(true);
    onMove({ move_type: 'roll' });
  };

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  // Group tokens sharing a square so they render stacked, not overlapping.
  const tokensBySquare = {};
  positions.forEach((pos, idx) => {
    if (pos <= 0) return;
    (tokensBySquare[pos] = tokensBySquare[pos] || []).push(idx);
  });

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Snakes &amp; Ladders</h2>
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">{players.map(p => p.username).join(', ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="snakes_ladders" />
            <button onClick={handleForfeit} className="text-gray-400 hover:text-white transition-colors">
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Turn indicator + roll */}
        {!winner && (
          <div className="p-4 bg-gray-700/50 border-b border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {players.map((player, index) => (
                  <div
                    key={player.user_id}
                    className={`px-3 py-1.5 rounded-lg border-2 transition-all ${
                      currentTurn === index ? 'border-purple-500 bg-purple-500/20 scale-105' : 'border-gray-600 bg-gray-800/50'
                    }`}
                  >
                    <div className="text-white font-semibold text-xs flex items-center gap-1">
                      <span>{TOKEN_EMOJI[index]}</span>{player.username}
                    </div>
                    <div className="text-gray-300 text-[11px]">Square {positions[index] || 0}</div>
                  </div>
                ))}
              </div>
              {isMyTurn && (
                <button
                  onClick={handleRoll}
                  disabled={rolling}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-semibold animate-pulse"
                >
                  {rolling ? 'Rolling…' : '🎲 Roll Dice'}
                </button>
              )}
              {!isMyTurn && lastRoll !== null && (
                <div className="text-gray-400 text-sm">Last roll: 🎲 {lastRoll}</div>
              )}
            </div>
          </div>
        )}

        {/* Board */}
        <div className="p-4">
          <div className="grid grid-cols-10 gap-0.5 mx-auto rounded-lg overflow-hidden border border-gray-600" style={{ maxWidth: 420 }}>
            {CELLS.map((square) => {
              const dest = SNAKES_LADDERS[square];
              const isLadder = dest !== undefined && dest > square;
              const isSnake = dest !== undefined && dest < square;
              const occupants = tokensBySquare[square] || [];
              const shade = Math.floor((square - 1) / 10) % 2 === 0 ? '#2d3548' : '#242b3d';
              return (
                <div
                  key={square}
                  className="aspect-square flex flex-col items-center justify-center relative text-[9px] text-gray-400"
                  style={{ background: shade }}
                >
                  <span className="absolute top-0.5 left-0.5">{square}</span>
                  {isLadder && <span className="text-sm" title={`Ladder to ${dest}`}>🪜</span>}
                  {isSnake && <span className="text-sm" title={`Snake to ${dest}`}>🐍</span>}
                  {occupants.length > 0 && (
                    <div className="absolute bottom-0.5 flex gap-0.5">
                      {occupants.map(idx => <span key={idx} className="text-xs">{TOKEN_EMOJI[idx]}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        {!winner && (
          <div className="p-6 border-t border-gray-700 flex justify-end">
            <button onClick={handleForfeit} className="px-6 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors">
              End Game
            </button>
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
