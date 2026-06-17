// src/components/Games/TicTacToeGame.jsx
import { useState, useEffect, useMemo } from 'react';
import { X as CloseIcon, Trophy, Users } from 'lucide-react';

const WINNING_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function getWinningLine(board) {
  for (const combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return combo;
  }
  return [];
}

// Minimal CSS-only confetti — 12 squares that animate outward
function Confetti() {
  const pieces = Array.from({ length: 16 }, (_, i) => i);
  const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#FFD700','#98FB98','#DDA0DD','#87CEEB'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {pieces.map(i => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${10 + (i * 5.5) % 80}%`,
            top: `${5 + (i * 7) % 40}%`,
            width: 8, height: 8,
            borderRadius: i % 3 === 0 ? '50%' : 2,
            background: colors[i % colors.length],
            animation: `ttt-confetti-${i % 4} ${0.8 + (i % 5) * 0.15}s ease-out forwards`,
            animationDelay: `${(i % 6) * 0.07}s`,
            opacity: 0,
          }}
        />
      ))}
      <style>{`
        @keyframes ttt-confetti-0 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(-40px,120px) rotate(360deg);opacity:0} }
        @keyframes ttt-confetti-1 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(30px,130px) rotate(-270deg);opacity:0} }
        @keyframes ttt-confetti-2 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(50px,100px) rotate(180deg);opacity:0} }
        @keyframes ttt-confetti-3 { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(-20px,140px) rotate(-360deg);opacity:0} }
      `}</style>
    </div>
  );
}

export default function TicTacToeGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [board, setBoard] = useState(Array(9).fill(''));
  const [currentTurn, setCurrentTurn] = useState(0);
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    setBoard(gs.board || Array(9).fill(''));
    setCurrentTurn(gs.current_turn ?? gameState.current_turn ?? 0);

    const isOver = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';
    if (isOver) {
      if (gameState.winner_id) {
        const winnerPlayer = players.find(p => p.user_id === gameState.winner_id);
        setWinner(winnerPlayer || 'draw');
      } else {
        setWinner('draw');
      }
    }
  }, [gameState, players]);

  const winningLine = useMemo(() => getWinningLine(board), [board]);
  const myPlayerIndex = players.findIndex(p => p.user_id === currentUserId);
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const mySymbol = myPlayerIndex === 0 ? 'X' : 'O';

  const handleCellClick = (position) => {
    if (!isMyTurn || board[position] || winner) return;
    onMove({ position });
  };

  const handleForfeit = () => {
    if (onEndGame) {
      onEndGame();
    } else {
      onClose();
    }
  };

  const symbolColor = (val) => val === 'X' ? '#FF6B6B' : '#4ECDC4';

  const isWon = winner && winner !== 'draw';
  const isDraw = winner === 'draw';
  const iWon = isWon && winner?.user_id === currentUserId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Confetti on win */}
        {isWon && <Confetti />}

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Tic Tac Toe</h2>
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">
                {players.map(p => p.username).join(' vs ')}
              </span>
            </div>
          </div>
          <button
            onClick={winner ? onClose : handleForfeit}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Winner overlay */}
        {winner && (
          <div className={`p-5 border-b border-gray-700 text-center ${
            isDraw
              ? 'bg-gradient-to-r from-gray-600/30 to-gray-500/30'
              : iWon
                ? 'bg-gradient-to-r from-yellow-500/25 to-green-500/25'
                : 'bg-gradient-to-r from-red-500/20 to-gray-600/20'
          }`}>
            <div className="text-5xl mb-2">
              {isDraw ? '🤝' : iWon ? '🏆' : '😞'}
            </div>
            <div className="text-xl font-bold text-white">
              {isDraw
                ? "It's a draw!"
                : `${winner.username} wins!`}
            </div>
            {!isDraw && (
              <div className="text-sm mt-1 text-gray-300">
                {iWon ? 'Well played!' : 'Better luck next time'}
              </div>
            )}
          </div>
        )}

        {/* Turn Indicator */}
        {!winner && (
          <div className="p-4 bg-gray-700/50 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {players.map((player, index) => (
                  <div
                    key={player.user_id}
                    className={`
                      px-4 py-2 rounded-lg border-2 transition-all
                      ${currentTurn === index
                        ? 'border-purple-500 bg-purple-500/20 scale-105'
                        : 'border-gray-600 bg-gray-800/50'
                      }
                    `}
                  >
                    <div className="text-white font-semibold text-sm">{player.username}</div>
                    <div className="text-2xl font-bold" style={{ color: player.color }}>
                      {index === 0 ? 'X' : 'O'}
                    </div>
                  </div>
                ))}
              </div>
              {isMyTurn && (
                <div className="text-green-400 font-semibold animate-pulse">
                  Your turn ({mySymbol})
                </div>
              )}
            </div>
          </div>
        )}

        {/* Game Board */}
        <div className="p-8">
          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {board.map((cell, index) => {
              const isWinCell = winningLine.includes(index);
              return (
                <button
                  key={index}
                  onClick={() => handleCellClick(index)}
                  disabled={!isMyTurn || !!cell || !!winner}
                  className={`
                    aspect-square rounded-lg border-2 flex items-center justify-center
                    transition-all duration-200 text-5xl font-bold
                    ${isWinCell
                      ? 'border-yellow-400 bg-yellow-400/20 scale-105'
                      : cell
                        ? 'border-gray-600 bg-gray-700/50 cursor-not-allowed'
                        : isMyTurn && !winner
                          ? 'border-purple-500 bg-purple-500/10 hover:bg-purple-500/25 hover:scale-105 cursor-pointer'
                          : 'border-gray-600 bg-gray-800/50 cursor-not-allowed'
                    }
                  `}
                  style={{ color: cell ? symbolColor(cell) : undefined }}
                >
                  {cell && (
                    <span style={{
                      display: 'block',
                      animation: 'ttt-pop 0.15s ease-out',
                    }}>
                      {cell}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <style>{`
            @keyframes ttt-pop {
              0% { transform: scale(0.3); opacity: 0.5; }
              70% { transform: scale(1.15); }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-end">
          {winner ? (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-semibold"
            >
              Close
            </button>
          ) : (
            <button
              onClick={handleForfeit}
              className="px-6 py-2 bg-gray-700 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Forfeit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
