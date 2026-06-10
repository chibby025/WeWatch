// src/components/Games/GameOverlay.jsx
import TicTacToeGame from './TicTacToeGame';
import RockPaperScissorsGame from './RockPaperScissorsGame';
import ChessGame from './ChessGame';
import TriviaGame from './TriviaGame';

export default function GameOverlay({ activeGame, currentUserId, onMove, onClose, onEndGame }) {
  if (!activeGame) return null;

  const handleMove = (moveData) => {
    onMove({
      game_session_id: activeGame.game_session_id,
      ...moveData
    });
  };

  switch (activeGame.game_type) {
    case 'tic_tac_toe':
      return (
        <TicTacToeGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
        />
      );

    case 'rock_paper_scissors':
      return (
        <RockPaperScissorsGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
        />
      );

    case 'chess':
      return (
        <ChessGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
        />
      );

    case 'trivia':
      return (
        <TriviaGame
          gameState={activeGame}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    default:
      return null;
  }
}
