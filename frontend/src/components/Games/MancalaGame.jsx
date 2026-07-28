// src/components/Games/MancalaGame.jsx
import { useState, useEffect } from 'react';
import { X as CloseIcon, Users } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors mancala.go's mancalaOwnPits exactly.
function ownPits(playerIdx) {
  return playerIdx === 0 ? { start: 0, end: 5, store: 6 } : { start: 7, end: 12, store: 13 };
}

const TOP_ROW = [12, 11, 10, 9, 8, 7]; // player1's pits, right-to-left across the top
const BOTTOM_ROW = [0, 1, 2, 3, 4, 5]; // player0's pits, left-to-right across the bottom

export default function MancalaGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [board, setBoard] = useState(Array(14).fill(0));
  const [currentTurn, setCurrentTurn] = useState(0);
  const [winner, setWinner] = useState(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    setBoard(gs.board && gs.board.length === 14 ? gs.board : Array(14).fill(0));
    setCurrentTurn(gameState.current_turn ?? 0);

    const over = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';
    setIsOver(over);
    if (over) {
      setWinner(gameState.winner_id ? (players.find(p => p.user_id === gameState.winner_id) || 'draw') : 'draw');
    } else {
      setWinner(null);
    }
  }, [gameState, players]);

  const myIdx = players.findIndex(p => p.user_id === currentUserId);
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId && !isOver;
  const { start, end } = ownPits(myIdx >= 0 ? myIdx : 0);

  const handlePitClick = (pit) => {
    if (!isMyTurn) return;
    if (pit < start || pit > end || board[pit] === 0) return;
    onMove({ pit });
  };

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  const p0Store = board[6] || 0;
  const p1Store = board[13] || 0;

  const Pit = ({ index }) => {
    const clickable = isMyTurn && index >= start && index <= end && board[index] > 0;
    return (
      <button
        onClick={() => handlePitClick(index)}
        disabled={!clickable}
        className={`aspect-square rounded-full flex items-center justify-center text-lg font-bold text-white transition-all ${
          clickable ? 'bg-amber-700 hover:bg-amber-600 ring-2 ring-amber-400 cursor-pointer' : 'bg-amber-900/60 cursor-default'
        }`}
      >
        {board[index] || 0}
      </button>
    );
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Mancala</h2>
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">{players.map(p => p.username).join(' vs ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="mancala" />
            <button onClick={handleForfeit} className="text-gray-400 hover:text-white transition-colors">
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Turn indicator */}
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
                    <div className="text-gray-300 text-xs">Store: {index === 0 ? p0Store : p1Store} seeds</div>
                  </div>
                ))}
              </div>
              {isMyTurn && <div className="text-green-400 font-semibold animate-pulse">Your turn</div>}
            </div>
          </div>
        )}

        {/* Board */}
        <div className="p-6">
          <div className="flex items-stretch gap-2 mx-auto" style={{ maxWidth: 500 }}>
            {/* Player 1's store (left) */}
            <div className="flex flex-col justify-center items-center w-14 rounded-xl bg-amber-950 text-white font-bold text-xl flex-shrink-0">
              {p1Store}
            </div>
            <div className="flex-1 grid grid-rows-2 gap-2">
              <div className="grid grid-cols-6 gap-2">
                {TOP_ROW.map(i => <Pit key={i} index={i} />)}
              </div>
              <div className="grid grid-cols-6 gap-2">
                {BOTTOM_ROW.map(i => <Pit key={i} index={i} />)}
              </div>
            </div>
            {/* Player 0's store (right) */}
            <div className="flex flex-col justify-center items-center w-14 rounded-xl bg-amber-950 text-white font-bold text-xl flex-shrink-0">
              {p0Store}
            </div>
          </div>
          <div className="flex justify-between mx-auto text-[11px] text-gray-500 mt-1" style={{ maxWidth: 500 }}>
            <span className="ml-16">{players[1]?.username ?? 'Player 2'}'s pits</span>
            <span className="mr-16">{players[0]?.username ?? 'Player 1'}'s pits</span>
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
        gameType="mancala"
        gameStats={{ lines: [
          { label: players[0]?.username ?? 'Player 1', value: `${p0Store} seeds` },
          { label: players[1]?.username ?? 'Player 2', value: `${p1Store} seeds` },
        ]}}
        isForfeit={gameState?.status === 'forfeited'}
        onClose={onClose}
        onPostResult={onPostResult}
      />
    )}
    </>
  );
}
