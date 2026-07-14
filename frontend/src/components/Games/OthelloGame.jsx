// src/components/Games/OthelloGame.jsx
import { useState, useEffect, useMemo } from 'react';
import { X as CloseIcon, Users } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

// Mirrors othello.go's othelloFlipsForMove exactly, so the client can highlight
// legal moves and gate clicks without waiting on a server round-trip.
function flipsForMove(board, position, color) {
  if (board[position] !== '') return [];
  const opponent = color === 'W' ? 'B' : 'W';
  const row = Math.floor(position / 8);
  const col = position % 8;
  const flips = [];

  for (const [dr, dc] of DIRECTIONS) {
    const lineFlips = [];
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opponent) {
      lineFlips.push(r * 8 + c);
      r += dr; c += dc;
    }
    if (lineFlips.length > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === color) {
      flips.push(...lineFlips);
    }
  }
  return flips;
}

function legalMoves(board, color) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    if (board[i] === '' && flipsForMove(board, i, color).length > 0) moves.push(i);
  }
  return moves;
}

export default function OthelloGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [board, setBoard] = useState(Array(64).fill(''));
  const [currentTurn, setCurrentTurn] = useState(0);
  const [winner, setWinner] = useState(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    setBoard(gs.board || Array(64).fill(''));
    setCurrentTurn(gameState.current_turn ?? 0);

    const over = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';
    setIsOver(over);
    if (over) {
      if (gameState.winner_id) {
        setWinner(players.find(p => p.user_id === gameState.winner_id) || 'draw');
      } else {
        setWinner('draw');
      }
    } else {
      setWinner(null);
    }
  }, [gameState, players]);

  const myColor = players.findIndex(p => p.user_id === currentUserId) === 0 ? 'B' : 'W';
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId && !isOver;
  const myMoves = useMemo(() => (isMyTurn ? legalMoves(board, myColor) : []), [board, myColor, isMyTurn]);
  const mustPass = isMyTurn && myMoves.length === 0;

  const counts = useMemo(() => {
    let black = 0, white = 0;
    for (const cell of board) {
      if (cell === 'B') black++;
      else if (cell === 'W') white++;
    }
    return { black, white };
  }, [board]);

  const handleCellClick = (position) => {
    if (!isMyTurn || !myMoves.includes(position)) return;
    onMove({ position });
  };

  const handlePass = () => {
    if (!mustPass) return;
    onMove({ position: -1 });
  };

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  const isDraw = winner === 'draw';
  const iWon = winner && winner !== 'draw' && winner.user_id === currentUserId;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Othello</h2>
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">{players.map(p => p.username).join(' vs ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="othello" />
            <button onClick={handleForfeit} className="text-gray-400 hover:text-white transition-colors">
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Turn indicator + disc counts */}
        {!winner && (
          <div className="p-4 bg-gray-700/50 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {players.map((player, index) => (
                  <div
                    key={player.user_id}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      currentTurn === index ? 'border-purple-500 bg-purple-500/20 scale-105' : 'border-gray-600 bg-gray-800/50'
                    }`}
                  >
                    <div className="text-white font-semibold text-sm">{player.username}</div>
                    <div className="text-xl font-bold flex items-center gap-1.5">
                      <span>{index === 0 ? '⚫' : '⚪'}</span>
                      <span className="text-gray-300 text-sm">{index === 0 ? counts.black : counts.white}</span>
                    </div>
                  </div>
                ))}
              </div>
              {isMyTurn && !mustPass && (
                <div className="text-green-400 font-semibold animate-pulse">Your turn</div>
              )}
              {mustPass && (
                <button
                  onClick={handlePass}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold animate-pulse"
                >
                  No moves — Pass
                </button>
              )}
            </div>
          </div>
        )}

        {/* Board */}
        <div className="p-6">
          <div className="grid grid-cols-8 gap-1 mx-auto bg-green-900 p-2 rounded-lg" style={{ maxWidth: 360 }}>
            {board.map((cell, index) => {
              const isLegal = myMoves.includes(index);
              return (
                <button
                  key={index}
                  onClick={() => handleCellClick(index)}
                  disabled={!isLegal}
                  className={`aspect-square rounded-sm flex items-center justify-center transition-all ${
                    isLegal ? 'bg-green-700 hover:bg-green-600 cursor-pointer' : 'bg-green-800 cursor-default'
                  }`}
                >
                  {cell && (
                    <span
                      className="block rounded-full"
                      style={{
                        width: '78%',
                        height: '78%',
                        background: cell === 'B'
                          ? 'radial-gradient(circle at 35% 30%, #555, #000)'
                          : 'radial-gradient(circle at 35% 30%, #fff, #ccc)',
                        boxShadow: '0 2px 3px rgba(0,0,0,0.5)',
                      }}
                    />
                  )}
                  {!cell && isLegal && (
                    <span className="block rounded-full bg-white/25" style={{ width: '30%', height: '30%' }} />
                  )}
                </button>
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
        gameType="othello"
        gameStats={{ lines: [
          { label: `${players[0]?.username ?? 'Player 1'} (⚫)`, value: String(counts.black) },
          { label: `${players[1]?.username ?? 'Player 2'} (⚪)`, value: String(counts.white) },
        ]}}
        isForfeit={gameState?.status === 'forfeited'}
        onClose={onClose}
        onPostResult={onPostResult}
      />
    )}
    </>
  );
}
