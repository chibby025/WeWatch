// src/components/Games/GameOverlay.jsx
import { lazy, Suspense } from 'react';
import TicTacToeGame from './TicTacToeGame';
import RockPaperScissorsGame from './RockPaperScissorsGame';
import ChessGame from './ChessGame';
import TriviaGame from './TriviaGame';
import RebusRoundGame from './RebusRoundGame';
import FourFramesGame from './FourFramesGame';
import KaraokeGame from './KaraokeGame';
import OthelloGame from './OthelloGame';
import CheckersGame from './CheckersGame';
import CrazyEightsGame from './CrazyEightsGame';
import LudoGame from './LudoGame';
import ConnectFourGame from './ConnectFourGame';
import WouldYouRatherGame from './WouldYouRatherGame';
import WordleGame from './WordleGame';
import UnoGame from './UnoGame';
import TypingRaceGame from './TypingRaceGame';
import BlackjackGame from './BlackjackGame';
import BattleshipGame from './BattleshipGame';
import DrawGuessGame from './DrawGuessGame';
// import BoxingGame from './BoxingGame'; // temporarily removed — being redesigned as Phaser 3 + Colyseus real-time game
import PoolGame from './PoolGame';
import WhotGame from './WhotGame';
import SnakesAndLaddersGame from './SnakesAndLaddersGame';
import MancalaGame from './MancalaGame';
import JigsawGame from './JigsawGame';
import WordsmithGame from './WordsmithGame';
import BackgammonGame from './BackgammonGame';
import PropertyTycoonGame from './PropertyTycoonGame';
import TexasHoldemGame from './TexasHoldemGame';

// Lazy-loaded — DOOM's iframe wrapper is tiny, but this establishes the
// pattern for any future heavy/rarely-used game: don't pay its bundle cost
// until a user actually opens it. First use of React.lazy in this codebase.
const DoomGame = lazy(() => import('./DoomGame'));
const Quake3Game = lazy(() => import('./Quake3Game'));
const VSBattleGame = lazy(() => import('./VsBattleGame'));
const FowlPlayGame = lazy(() => import('./FowlPlayGame'));
// const PenaltyGame = lazy(() => import('./PenaltyGame')); // temporarily removed
const SpaceAttackGame = lazy(() => import('./SpaceAttackGame'));
const ToadBallGame = lazy(() => import('./ToadBallGame'));
const GolfGame = lazy(() => import('./GolfGame'));
const MicroRacingGame = lazy(() => import('./MicroRacingGame'));
const ObbyParkourGame = lazy(() => import('./ObbyParkourGame'));
// 3D + physics (react-three-fiber, cannon-es) — heaviest bundle in this
// package after DOOM, same lazy-load rationale.
const RampRushGame = lazy(() => import('./RampRushGame'));
// const RouletteGame = lazy(() => import('./RouletteGame')); // temporarily removed

import HangmanGame from './HangmanGame';
import GlassBridgeGame from './GlassBridgeGame';
import TugOfWarGame from './TugOfWarGame';
// import RedLightGreenLightGame from './RedLightGreenLightGame'; // temporarily removed
import SudokuGame from './SudokuGame';
import PingPongGame from './PingPongGame';
import AirHockeyGame from './AirHockeyGame';

export default function GameOverlay({ activeGame, currentUserId, roomId, onMove, onClose, onEndGame, onPlayAgain, onPostResult, onRelayPacket, registerRelayReceiver, myHand, drawerWord, hotSeatTournament, onTournamentScore, gameErrorMsg, gameErrorKey }) {
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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

    case 'rebus_round':
      return (
        <RebusRoundGame
          gameState={activeGame}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onPostResult={onPostResult}
          gameErrorMsg={gameErrorMsg}
          gameErrorKey={gameErrorKey}
        />
      );

    case 'four_frames':
      return (
        <FourFramesGame
          gameState={activeGame}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onPostResult={onPostResult}
          gameErrorMsg={gameErrorMsg}
          gameErrorKey={gameErrorKey}
        />
      );

    case 'karaoke':
      return (
        <KaraokeGame
          gameState={activeGame}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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
          onPostResult={onPostResult}
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

    case 'quake3':
      // Genuine N-player multiplayer, unlike DOOM: every room member's
      // iframe connects directly to a dedicated per-room WS supervisor (a
      // separate Railway service) over the engine's own real netcode — no
      // relay through this app's backend, no host/spectator split. isHost
      // only gates the extra "End for Everyone" control.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <Quake3Game
            roomId={roomId}
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );

    case 'micro_racing':
      // Genuine N-player multiplayer, same shape as quake3 above — every
      // room member's iframe connects directly to the forked racing app's
      // own Railway-hosted server (its own real room/physics/netcode), no
      // relay through this app's backend. isHost only gates the extra
      // "End for Everyone" control.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <MicroRacingGame
            roomId={roomId}
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );

    case 'obby_parkour':
      // Genuine N-player multiplayer, same shape as quake3/micro_racing
      // above — every room member's iframe connects directly to the
      // forked parkour app's own supervisor-fronted Railway service (its
      // own real room/physics/netcode via a genuinely isolated per-room
      // process), no relay through this app's backend. isHost only gates
      // the extra "End for Everyone" control.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <ObbyParkourGame
            roomId={roomId}
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );

    case 'vs_battle':
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-gray-900 flex items-center justify-center text-white text-lg">Loading VS Battle…</div>}>
          <VSBattleGame
            key={activeGame.game_session_id}
            gameState={activeGame}
            players={activeGame.players || []}
            currentUserId={currentUserId}
            roomId={roomId}
            onMove={handleMove}
            onClose={onClose}
            onEndGame={onEndGame}
          />
        </Suspense>
      );

    // case 'boxing': temporarily removed — being redesigned as Phaser 3 + Colyseus real-time game
    // return (
    //   <BoxingGame
    //     gameState={activeGame}
    //     players={activeGame.players}
    //     currentUserId={currentUserId}
    //     onMove={handleMove}
    //     onClose={onClose}
    //     onEndGame={onEndGame}
    //   />
    // );

    case 'pool':
      return (
        <PoolGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'fowl_play':
      // Arcade: single-player or hot-seat tournament. Non-playing members get
      // a live spectator view inside FowlPlayGame itself, driven by relayed
      // duck/score snapshots from the host's game — not a second iframe load.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <FowlPlayGame
            gameState={activeGame}
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
            hotSeatTournament={hotSeatTournament}
            currentUserId={currentUserId}
            onTournamentScore={onTournamentScore}
            onRelayPacket={onRelayPacket}
            registerRelayReceiver={registerRelayReceiver}
          />
        </Suspense>
      );

    case 'whot':
      return (
        <WhotGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          myHand={myHand}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    // case 'penalty_shootout': temporarily removed
    // return (
    //   <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
    //     <PenaltyGame
    //       onClose={onClose}
    //       onEndGame={onEndGame}
    //       isHost={activeGame.host_id === currentUserId}
    //       hotSeatTournament={hotSeatTournament}
    //       currentUserId={currentUserId}
    //       onTournamentScore={onTournamentScore}
    //     />
    //   </Suspense>
    // );

    case 'hangman':
      return (
        <HangmanGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'glass_bridge':
      return (
        <GlassBridgeGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'tug_of_war':
      return (
        <TugOfWarGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    // case 'red_light_green_light': temporarily removed
    // return (
    //   <RedLightGreenLightGame
    //     gameState={activeGame}
    //     players={activeGame.players}
    //     currentUserId={currentUserId}
    //     onMove={handleMove}
    //     onClose={onClose}
    //     onEndGame={onEndGame}
    //   />
    // );

    case 'sudoku':
      return (
        <SudokuGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'ping_pong':
      return (
        <PingPongGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'snakes_ladders':
      return (
        <SnakesAndLaddersGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'mancala':
      return (
        <MancalaGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'ramp_rush':
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-gray-950 flex items-center justify-center text-white text-lg">Loading Ramp Rush…</div>}>
          <RampRushGame
            gameState={activeGame}
            players={activeGame.players}
            currentUserId={currentUserId}
            onMove={handleMove}
            onClose={onClose}
            onEndGame={onEndGame}
            onPostResult={onPostResult}
          />
        </Suspense>
      );

    case 'jigsaw':
      return (
        <JigsawGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'wordsmith':
      return (
        <WordsmithGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          myHand={myHand}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
          gameErrorMsg={gameErrorMsg}
          gameErrorKey={gameErrorKey}
        />
      );

    case 'backgammon':
      return (
        <BackgammonGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'property_tycoon':
      return (
        <PropertyTycoonGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'texas_holdem':
      return (
        <TexasHoldemGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          myHand={myHand}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPostResult={onPostResult}
        />
      );

    case 'air_hockey':
      return (
        <AirHockeyGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
        />
      );

    case 'space_attack':
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <SpaceAttackGame
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );

    case 'toad_ball':
      // Arcade: single-player or hot-seat tournament — same "pass the device
      // to whoever's turn it is" pattern as fowl_play, but self-contained
      // canvas gameplay (no relay plumbing needed, unlike fowl_play's iframe).
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <ToadBallGame
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
            hotSeatTournament={hotSeatTournament}
            currentUserId={currentUserId}
            onTournamentScore={onTournamentScore}
          />
        </Suspense>
      );

    case 'golf':
      // Arcade: single-player or hot-seat tournament, iframe-embedded (see
      // GolfGame.jsx header) — combines toad_ball's hot-seat precedence with
      // fowl_play's iframe/postMessage shape, since golf has no server-side
      // move logic of its own (a real Vercel-hosted fork, not a relay).
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <GolfGame
            onClose={onClose}
            onEndGame={onEndGame}
            isHost={activeGame.host_id === currentUserId}
            hotSeatTournament={hotSeatTournament}
            currentUserId={currentUserId}
            onTournamentScore={onTournamentScore}
          />
        </Suspense>
      );

    // case 'roulette': temporarily removed
    // return (
    //   <Suspense fallback={<div className="fixed inset-0 bg-gray-950" />}>
    //     <RouletteGame
    //       gameState={activeGame}
    //       players={activeGame.players}
    //       currentUserId={currentUserId}
    //       onMove={handleMove}
    //       onClose={onClose}
    //       onEndGame={onEndGame}
    //     />
    //   </Suspense>
    // );

    default:
      return null;
  }
}
