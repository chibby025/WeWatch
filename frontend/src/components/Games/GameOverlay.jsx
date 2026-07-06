// src/components/Games/GameOverlay.jsx
import { lazy, Suspense } from 'react';
import TicTacToeGame from './TicTacToeGame';
import RockPaperScissorsGame from './RockPaperScissorsGame';
import ChessGame from './ChessGame';
import TriviaGame from './TriviaGame';
import OthelloGame from './OthelloGame';
import CheckersGame from './CheckersGame';
import CrazyEightsGame from './CrazyEightsGame';
import LudoGame from './LudoGame';
import ConnectFourGame from './ConnectFourGame';
import WouldYouRatherGame from './WouldYouRatherGame';
import WordleGame from './WordleGame';
import UnoGame from './UnoGame';
import QuiplashGame from './QuiplashGame';
import TypingRaceGame from './TypingRaceGame';
import BlackjackGame from './BlackjackGame';
import BattleshipGame from './BattleshipGame';
import DrawGuessGame from './DrawGuessGame';

// Lazy-loaded — DOOM's iframe wrapper is tiny, but this establishes the
// pattern for any future heavy/rarely-used game: don't pay its bundle cost
// until a user actually opens it. First use of React.lazy in this codebase.
const DoomGame = lazy(() => import('./DoomGame'));
const ShooterGame = lazy(() => import('./ShooterGame'));
const VSBattleGame = lazy(() => import('./VSBattleGame'));

export default function GameOverlay({ activeGame, currentUserId, roomId, onMove, onClose, onEndGame, onPlayAgain, onRelayPacket, registerRelayReceiver, myHand, drawerWord }) {
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

    case 'othello':
      return (
        <OthelloGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'checkers':
      return (
        <CheckersGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'crazy_eights':
      return (
        <CrazyEightsGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          myHand={myHand}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'ludo':
      return (
        <LudoGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'connect_four':
      return (
        <ConnectFourGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'would_you_rather':
      return (
        <WouldYouRatherGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'wordle':
      return (
        <WordleGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'uno':
      return (
        <UnoGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          myHand={myHand}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'quiplash':
      return (
        <QuiplashGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'typing_race':
      return (
        <TypingRaceGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'blackjack':
      return (
        <BlackjackGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'battleship':
      return (
        <BattleshipGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'draw_guess':
      // Canvas strokes travel over the relay bridge (onRelayPacket /
      // registerRelayReceiver), not make_move. drawerWord is the secret word,
      // delivered privately to the drawer only via the draw_word WS message.
      return (
        <DrawGuessGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          drawerWord={drawerWord}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onRelayPacket={onRelayPacket}
          registerRelayReceiver={registerRelayReceiver}
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

    case 'vs_battle':
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-gray-900 flex items-center justify-center text-white text-lg">Loading VS Battle…</div>}>
          <VSBattleGame
            gameState={activeGame}
            players={activeGame.players || []}
            currentUserId={currentUserId}
            onMove={handleMove}
            onClose={onClose}
            onEndGame={onEndGame}
          />
        </Suspense>
      );

    default:
      return null;
  }
}
