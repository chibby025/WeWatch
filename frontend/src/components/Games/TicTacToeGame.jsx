// src/components/Games/TicTacToeGame.jsx
import { useState, useEffect } from 'react';
import { X as CloseIcon, Trophy, Users } from 'lucide-react';

export default function TicTacToeGame({ gameState, players, currentUserId, onMove, onClose }) {
  const [board, setBoard] = useState(Array(9).fill(''));
  const [currentTurn, setCurrentTurn] = useState(0);
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState([]);

  useEffect(() => {
    if (gameState?.game_state) {
      setBoard(gameState.game_state.board || Array(9).fill(''));
      setCurrentTurn(gameState.game_state.current_turn || 0);
      
      if (gameState.status === 'finished') {
        const winnerPlayer = players.find(p => p.score > 0);
        setWinner(winnerPlayer || 'draw');
      }
    }
  }, [gameState, players]);

  const myPlayerIndex = players.findIndex(p => p.user_id === currentUserId);
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const mySymbol = myPlayerIndex === 0 ? 'X' : 'O';

  const handleCellClick = (position) => {
    if (!isMyTurn || board[position] || winner) return;
    onMove({ position });
  };

  const getSymbol = (value) => {
    if (!value) return { text: '', color: '' };
    return {
      text: value,
      color: value === 'X' ? '#FF6B6B' : '#4ECDC4'
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
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
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

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
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-gray-600 bg-gray-800/50'
                      }
                    `}
                  >
                    <div className="text-white font-semibold text-sm">
                      {player.username}
                    </div>
                    <div
                      className="text-2xl font-bold"
                      style={{ color: player.color }}
                    >
                      {index === 0 ? 'X' : 'O'}
                    </div>
                  </div>
                ))}
              </div>
              {isMyTurn && (
                <div className="text-green-400 font-semibold">
                  Your turn ({mySymbol})
                </div>
              )}
            </div>
          </div>
        )}

        {/* Winner Display */}
        {winner && (
          <div className="p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-b border-gray-700">
            <div className="flex items-center justify-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <span className="text-xl font-bold text-white">
                {winner === 'draw'
                  ? "It's a draw!"
                  : `${winner.username} wins! 🎉`
                }
              </span>
            </div>
          </div>
        )}

        {/* Game Board */}
        <div className="p-8">
          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {board.map((cell, index) => {
              const symbol = getSymbol(cell);
              return (
                <button
                  key={index}
                  onClick={() => handleCellClick(index)}
                  disabled={!isMyTurn || cell || winner}
                  className={`
                    aspect-square rounded-lg border-2 flex items-center justify-center
                    transition-all text-5xl font-bold
                    ${cell
                      ? 'border-gray-600 bg-gray-700/50 cursor-not-allowed'
                      : isMyTurn && !winner
                        ? 'border-purple-500 bg-purple-500/10 hover:bg-purple-500/20 cursor-pointer'
                        : 'border-gray-600 bg-gray-800/50 cursor-not-allowed'
                    }
                  `}
                  style={{ color: symbol.color }}
                >
                  {symbol.text}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {winner ? 'Close' : 'Forfeit'}
          </button>
        </div>
      </div>
    </div>
  );
}
