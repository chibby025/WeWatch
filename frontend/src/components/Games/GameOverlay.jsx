// src/components/Games/GameOverlay.jsx
import { useState, useEffect } from 'react';
import TicTacToeGame from './TicTacToeGame';
import RockPaperScissorsGame from './RockPaperScissorsGame';

export default function GameOverlay({ activeGame, currentUserId, onMove, onClose, webSocketService }) {
  const [gameState, setGameState] = useState(activeGame);

  useEffect(() => {
    setGameState(activeGame);
  }, [activeGame]);

  useEffect(() => {
    if (!webSocketService) return;

    const handleGameUpdate = (data) => {
      setGameState(data);
    };

    const handleGameEnded = (data) => {
      setGameState(data);
    };

    const handleGameForfeited = (data) => {
      console.log('🎮 Game forfeited:', data);
      // Close game overlay
      setTimeout(() => onClose(), 2000);
    };

    webSocketService.on('game_state_update', handleGameUpdate);
    webSocketService.on('game_ended', handleGameEnded);
    webSocketService.on('game_forfeited', handleGameForfeited);

    return () => {
      webSocketService.off('game_state_update', handleGameUpdate);
      webSocketService.off('game_ended', handleGameEnded);
      webSocketService.off('game_forfeited', handleGameForfeited);
    };
  }, [webSocketService, onClose]);

  if (!gameState) return null;

  const handleMove = (moveData) => {
    onMove({
      game_session_id: gameState.game_session_id,
      ...moveData
    });
  };

  const gameType = gameState.game_type;

  // Route to correct game component
  switch (gameType) {
    case 'tic_tac_toe':
      return (
        <TicTacToeGame
          gameState={gameState}
          players={gameState.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
        />
      );

    case 'rock_paper_scissors':
      return (
        <RockPaperScissorsGame
          gameState={gameState}
          players={gameState.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
        />
      );

    case 'ludo':
      // Placeholder for Phase 4
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl shadow-2xl p-8 text-center">
            <div className="text-6xl mb-4">🎲</div>
            <h2 className="text-2xl font-bold text-white mb-2">Ludo</h2>
            <p className="text-gray-400 mb-6">Coming in Phase 4!</p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}
