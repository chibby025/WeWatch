// src/components/Games/TicTacToeGame.jsx
import { useState, useEffect, useMemo } from 'react';
import { X as CloseIcon, Users } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

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

export default function TicTacToeGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
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
        setWinner(players.find(p => p.user_id === gameState.winner_id) || 'draw');
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
    if (onEndGame) onEndGame();
    else onClose();
  };

  const symbolColor = (val) => val === 'X' ? '#FF6B6B' : '#4ECDC4';

  const totalMoves = board.filter(c => c).length;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <img
                src="https://LetsWatchOut.b-cdn.net/games/logos/tic_tac_toe.webp"
                alt="Tic Tac Toe"
                className="h-8 sm:h-9 w-auto mb-1"
              />
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-gray-400">
                  {players.map(p => p.username).join(' vs ')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="tic_tac_toe" />
              <button
                onClick={winner ? handleForfeit : handleForfeit}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
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
                          ? 'border-purple-500 bg-purple-500/20 scale-105'
                          : 'border-gray-600 bg-gray-800/50'
                        }
                      `}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {/* Player avatar — same circular image-or-initials pattern
                            GameLobbyModal's player-selection rows already use. */}
                        <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 bg-gray-600 flex items-center justify-center">
                          {player.avatar_url ? (
                            <img src={player.avatar_url} alt={player.username} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[8px] font-bold text-white">
                              {(player.username || '?').slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="text-white font-semibold text-sm truncate">{player.username}</div>
                      </div>
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
                      <span style={{ display: 'block', animation: 'ttt-pop 0.15s ease-out' }}>
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
          {!winner && (
            <div className="p-6 border-t border-gray-700 flex justify-end">
              <button
                onClick={handleForfeit}
                className="px-6 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors"
              >
                End Game
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Winner banner — fixed z-[200], above the game overlay */}
      {winner && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="tic_tac_toe"
          gameStats={{ lines: [
            { label: 'Total moves', value: String(totalMoves) },
            { label: 'Board', value: '3 × 3' },
          ]}}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </>
  );
}
