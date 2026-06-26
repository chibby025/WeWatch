// src/components/Games/GameOverlay.jsx
import { lazy, Suspense } from 'react';
import TicTacToeGame from './TicTacToeGame';
import RockPaperScissorsGame from './RockPaperScissorsGame';
import ChessGame from './ChessGame';
import TriviaGame from './TriviaGame';

// Lazy-loaded — DOOM's iframe wrapper is tiny, but this establishes the
// pattern for any future heavy/rarely-used game: don't pay its bundle cost
// until a user actually opens it. First use of React.lazy in this codebase.
const DoomGame = lazy(() => import('./DoomGame'));
const ShooterGame = lazy(() => import('./ShooterGame'));

export default function GameOverlay({ activeGame, currentUserId, roomId, onMove, onClose, onEndGame, onPlayAgain, onRelayPacket, registerRelayReceiver }) {
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
          onEndGame={onEndGame}
        />
      );

    case 'rock_paper_scissors':
      return (
        <RockPaperScissorsGame
          key={activeGame.game_session_id}
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPlayAgain={onPlayAgain}
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
          onEndGame={onEndGame}
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

    case 'doom':
      // Real multiplayer over DOOM's own networking protocol: the host's
      // instance is the authoritative server, every other member's instance
      // connects as a read-only spectator (the engine's own "drone" mode —
      // receives live state, never sends input). Every room member loads the
      // iframe; isHost decides which role it launches as.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <DoomGame
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
            onRelayPacket={onRelayPacket}
            registerRelayReceiver={registerRelayReceiver}
          />
        </Suspense>
      );

    case 'space_shooter':
      // Genuine simultaneous multiplayer (not host+spectator like DOOM) --
      // the Railway-hosted server is its own authoritative match; every
      // selected player gets a real ship. roomId routes everyone from this
      // WeWatch room into the same isolated match server-side.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <ShooterGame
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
            roomId={roomId}
          />
        </Suspense>
      );

    default:
      return null;
  }
}
