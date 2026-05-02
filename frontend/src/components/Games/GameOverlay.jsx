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

  // Multiplayer games - full overlay
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

    default:
      return null;
  }
}
