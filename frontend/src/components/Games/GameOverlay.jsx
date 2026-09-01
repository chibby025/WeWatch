// src/components/Games/GameOverlay.jsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import GameStartInfoModal from './GameStartInfoModal';
import TicTacToeGame from './TicTacToeGame';
import RockPaperScissorsGame from './RockPaperScissorsGame';
import ChessGame from './ChessGame';
import TriviaGame from './TriviaGame';
import RebusRoundGame from './RebusRoundGame';
import FourFramesGame from './FourFramesGame';
import OthelloGame from './OthelloGame';
import CheckersGame from './CheckersGame';
import CrazyEightsGame from './CrazyEightsGame';
import DominoesGame from './DominoesGame';
import DartsGame from './DartsGame';
import BowlingGame from './BowlingGame';
const BasketballGame = lazy(() => import('./BasketballGame'));
// import ArcheryGame from './ArcheryGame'; // temporarily removed
// import CurlingGame from './CurlingGame'; // temporarily removed
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
const RhythmHeroGame = lazy(() => import('./RhythmHeroGame'));
// const GolfGame = lazy(() => import('./GolfGame')); // removed 2026-08, see the commented-out case below
const SliceFrenzyGame = lazy(() => import('./SliceFrenzyGame'));
// const SkeeballGame = lazy(() => import('./SkeeballGame')); // temporarily removed
const ObbyParkourGame = lazy(() => import('./ObbyParkourGame'));
const TeeworldsGame = lazy(() => import('./TeeworldsGame'));
// const MicroRacingGame = lazy(() => import('./MicroRacingGame')); // temporarily removed
// const RampRushGame = lazy(() => import('./RampRushGame')); // temporarily removed
// const RouletteGame = lazy(() => import('./RouletteGame')); // temporarily removed

import HangmanGame from './HangmanGame';
import GlassBridgeGame from './GlassBridgeGame';
import TugOfWarGame from './TugOfWarGame';
// import RedLightGreenLightGame from './RedLightGreenLightGame'; // temporarily removed
import SudokuGame from './SudokuGame';
import PingPongGame from './PingPongGame';
import TankBattleGame from './TankBattleGame';
import BombermanGame from './BombermanGame';
// const FootballGame = lazy(() => import('./FootballGame')); // temporarily removed
// import BlobBattleGame from './BlobBattleGame'; // temporarily removed
// import HideSeekGame from './HideSeekGame'; // removed 2026-08, see the commented-out case below
import AirHockeyGame from './AirHockeyGame';

// The brief poster+instructions intro (GameStartInfoModal) needs to show
// once per genuinely NEW game start — never on a reconnect/rehydration
// re-render of the same session, which would otherwise re-trigger it every
// time this component remounts mid-game. This thin wrapper owns that
// one-shot timing/tracking and renders the intro as an overlay ON TOP of
// the real game overlay (mounted underneath immediately, unaffected by the
// intro's own show/hide) — every game gets this for free, no per-game
// wiring needed.
export default function GameOverlay(props) {
  const { activeGame } = props;
  const [showIntro, setShowIntro] = useState(false);
  // Tracks the game_session_id whose intro has been fully resolved — either
  // shown-and-dismissed, or skipped outright because this session started
  // via "Play Again" (activeGame.is_replay). Games with their own intro-
  // gated countdown (Rock Paper Scissors, Bomberman) read introResolved
  // below to know when it's safe to actually start ticking, rather than
  // racing the countdown against the popup that's still covering it.
  const [introResolvedSessionId, setIntroResolvedSessionId] = useState(null);
  const shownForSessionRef = useRef(null);

  useEffect(() => {
    const sessionId = activeGame?.game_session_id;
    if (sessionId == null) return;
    if (shownForSessionRef.current === sessionId) return;
    shownForSessionRef.current = sessionId;
    if (activeGame.is_replay) {
      // A rematch of a game every connected client already saw the rules
      // for a moment ago — skip the popup entirely and resolve immediately.
      setShowIntro(false);
      setIntroResolvedSessionId(sessionId);
    } else {
      setShowIntro(true);
    }
  }, [activeGame?.game_session_id, activeGame?.is_replay]);

  if (!activeGame) return null;

  const introResolved = introResolvedSessionId === activeGame.game_session_id;

  return (
    <>
      <GameOverlayInner {...props} introResolved={introResolved} />
      {showIntro && (
        <GameStartInfoModal
          gameType={activeGame.game_type}
          onDismiss={() => {
            setShowIntro(false);
            setIntroResolvedSessionId(activeGame.game_session_id);
          }}
        />
      )}
    </>
  );
}

function GameOverlayInner({ activeGame, currentUserId, roomId, sessionId, onMove, onClose, onEndGame, onPlayAgain, onPostResult, onRelayPacket, registerRelayReceiver, myHand, drawerWord, hotSeatTournament, onTournamentScore, gameErrorMsg, gameErrorKey, onRhythmHeroBroadcast, rhythmHeroLiveInfo, rhythmHeroSelectingInfo, rhythmHeroScoreInfo, rhythmHeroLeaderboard, registerRhythmHeroInputReceiver, registerRhythmHeroCheerReceiver, currentUsername, introResolved }) {
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
          onPlayAgain={onPlayAgain}
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
          introResolved={introResolved}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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

    case 'othello':
      return (
        <OthelloGame
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

    case 'checkers':
      return (
        <CheckersGame
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
          onPlayAgain={onPlayAgain}
          onPostResult={onPostResult}
        />
      );

    case 'dominoes':
      return (
        <DominoesGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          myHand={myHand}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPlayAgain={onPlayAgain}
          onPostResult={onPostResult}
        />
      );

    case 'darts':
      return (
        <DartsGame
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

    case 'bowling':
      return (
        <BowlingGame
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

    case 'basketball':
      return (
        <Suspense
          fallback={(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-16 h-16">
                  <span className="absolute inset-0 flex items-center justify-center text-4xl">🏀</span>
                  <div className="absolute inset-0 rounded-full border-4 border-gray-700 border-t-orange-500 animate-spin" />
                </div>
                <p className="text-white text-sm font-medium">Loading Basketball…</p>
              </div>
            </div>
          )}
        >
          <BasketballGame
            gameState={activeGame}
            players={activeGame.players}
            currentUserId={currentUserId}
            onMove={handleMove}
            onClose={onClose}
            onEndGame={onEndGame}
            onPlayAgain={onPlayAgain}
            onPostResult={onPostResult}
          />
        </Suspense>
      );

    // case 'archery': temporarily removed
    //   return (
    //     <ArcheryGame
    //       gameState={activeGame}
    //       players={activeGame.players}
    //       currentUserId={currentUserId}
    //       onMove={handleMove}
    //       onClose={onClose}
    //       onEndGame={onEndGame}
    //       onPlayAgain={onPlayAgain}
    //       onPostResult={onPostResult}
    //     />
    //   );

    // case 'curling': // temporarily removed
    //   return (
    //     <CurlingGame
    //       gameState={activeGame}
    //       players={activeGame.players}
    //       currentUserId={currentUserId}
    //       onMove={handleMove}
    //       onClose={onClose}
    //       onEndGame={onEndGame}
    //       onPlayAgain={onPlayAgain}
    //       onPostResult={onPostResult}
    //     />
    //   );

    case 'ludo':
      return (
        <LudoGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
            onPlayAgain={onPlayAgain}
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
            onPlayAgain={onPlayAgain}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );

    /* case 'micro_racing': temporarily removed
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
            onPlayAgain={onPlayAgain}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );
    */

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
            onPlayAgain={onPlayAgain}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );

    case 'teeworlds':
      // Genuine N-player multiplayer, same shape as obby_parkour/quake3/
      // micro_racing above — every room member's iframe connects directly
      // to the WASM Teeworlds client's own supervisor-fronted Railway
      // service (its own real per-room dedicated server + netcode via
      // Emscripten's transparent UDP-over-WebSocket socket emulation, no
      // relay through this app's backend). isHost only gates the extra
      // "End for Everyone" control.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <TeeworldsGame
            roomId={roomId}
            onClose={onClose}
            onEndGame={onEndGame}
            onPlayAgain={onPlayAgain}
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
            onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
          onPostResult={onPostResult}
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
            onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
          onPostResult={onPostResult}
        />
      );

    case 'tank_battle':
      // Real-time 2-player PvP, same shape as ping_pong (gameState/players
      // props, not the arcade hot-seat shape) — each tank is self-controlled
      // and self-relayed, no single physics authority needed (see
      // tank_battle.go's file-level architecture note).
      return (
        <TankBattleGame
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

    case 'bomberman':
      // Real-time N-player (2-4) grid duel, same shape as tank_battle —
      // each character is self-controlled and self-relayed; whoever places
      // a bomb is the sole authority over that bomb's explosion outcome
      // (see bomberman.go's file-level architecture note).
      return (
        <BombermanGame
          gameState={activeGame}
          players={activeGame.players}
          currentUserId={currentUserId}
          onMove={handleMove}
          onClose={onClose}
          onEndGame={onEndGame}
          onPlayAgain={onPlayAgain}
          onPostResult={onPostResult}
          introResolved={introResolved}
        />
      );

    // case 'football': temporarily removed
    //   // Single-player 3D arcade match (host vs AI, forked from
    //   // world-cup-arena) — host-only-ever, same shape as DOOM/Golf. No
    //   // server-side move logic at all, so no onMove/onPostResult wiring.
    //   return (
    //     <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
    //       <FootballGame
    //         onClose={onClose}
    //         onEndGame={onEndGame}
    //         onPlayAgain={onPlayAgain}
    //         isHost={activeGame.host_id === currentUserId}
    //         hostUsername={activeGame.players?.find((p) => p.user_id === activeGame.host_id)?.username}
    //       />
    //     </Suspense>
    //   );

    // case 'blob_battle': temporarily removed
    //   // Real-time N-player (2-8) Agar.io-style free-for-all — mass is
    //   // authoritatively tracked server-side, not self-reported (see
    //   // blob_battle.go's file-level note on why this game breaks from the
    //   // "casual trust" model everywhere else in this arcade layer).
    //   return (
    //     <BlobBattleGame
    //       gameState={activeGame}
    //       players={activeGame.players}
    //       currentUserId={currentUserId}
    //       onMove={handleMove}
    //       onClose={onClose}
    //       onEndGame={onEndGame}
    //       onPlayAgain={onPlayAgain}
    //       onPostResult={onPostResult}
    //     />
    //   );

    // hide_seek removed 2026-08 at user request (commented out, not
    // deleted, alongside its GameLobbyModal.jsx entry — the game is now
    // unreachable but can be restored by uncommenting both).
    // case 'hide_seek':
    //   // Real-time N-player (2-8) hidden-role game — the first genuinely
    //   // asymmetric-information game in this arcade layer, and the only
    //   // one needing gameErrorMsg/gameErrorKey (for surfacing "that spot is
    //   // already taken," the one common rejection a Prop has no client-side
    //   // way to predict — see hide_seek.go's file-level note).
    //   return (
    //     <HideSeekGame
    //       gameState={activeGame}
    //       players={activeGame.players}
    //       currentUserId={currentUserId}
    //       onMove={handleMove}
    //       onClose={onClose}
    //       onEndGame={onEndGame}
    //       onPlayAgain={onPlayAgain}
    //       onPostResult={onPostResult}
    //       gameErrorMsg={gameErrorMsg}
    //       gameErrorKey={gameErrorKey}
    //     />
    //   );

    case 'snakes_ladders':
      return (
        <SnakesAndLaddersGame
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

    case 'mancala':
      return (
        <MancalaGame
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

    /* ramp_rush temporarily removed
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
            onPlayAgain={onPlayAgain}
            onPostResult={onPostResult}
          />
        </Suspense>
      );
    */

    case 'jigsaw':
      return (
        <JigsawGame
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
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
          onPlayAgain={onPlayAgain}
        />
      );

    case 'space_attack':
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <SpaceAttackGame
            onClose={onClose}
            onEndGame={onEndGame}
            onPlayAgain={onPlayAgain}
            isHost={activeGame.host_id === currentUserId}
          />
        </Suspense>
      );

    case 'toad_ball':
      // Arcade: single-player or hot-seat tournament — same "pass the device
      // to whoever's turn it is" pattern as fowl_play. Non-playing members
      // get a live spectator view inside ToadBallGame itself, driven by
      // relayed full-state snapshots from the host's own running game —
      // same generic relay_packet plumbing fowl_play already uses.
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <ToadBallGame
            onClose={onClose}
            onEndGame={onEndGame}
            onPlayAgain={onPlayAgain}
            isHost={activeGame.host_id === currentUserId}
            hotSeatTournament={hotSeatTournament}
            currentUserId={currentUserId}
            onTournamentScore={onTournamentScore}
            onRelayPacket={onRelayPacket}
            registerRelayReceiver={registerRelayReceiver}
          />
        </Suspense>
      );

    case 'rhythm_hero':
      // Arcade: single-player or hot-seat tournament — same pattern as
      // toad_ball (self-contained canvas gameplay, here a Three.js note-
      // highway rhythm game instead of a 2D canvas one).
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <RhythmHeroGame
            onClose={onClose}
            onEndGame={onEndGame}
            onPlayAgain={onPlayAgain}
            isHost={activeGame.host_id === currentUserId}
            hotSeatTournament={hotSeatTournament}
            currentUserId={currentUserId}
            onTournamentScore={onTournamentScore}
            onRhythmHeroBroadcast={onRhythmHeroBroadcast}
            rhythmHeroLiveInfo={rhythmHeroLiveInfo}
            rhythmHeroSelectingInfo={rhythmHeroSelectingInfo}
            rhythmHeroScoreInfo={rhythmHeroScoreInfo}
            rhythmHeroLeaderboard={rhythmHeroLeaderboard}
            currentUsername={currentUsername}
            registerRhythmHeroInputReceiver={registerRhythmHeroInputReceiver}
            registerRhythmHeroCheerReceiver={registerRhythmHeroCheerReceiver}
            roomId={roomId}
            sessionId={sessionId}
            onPostResult={onPostResult}
          />
        </Suspense>
      );

    // 3D Golf removed 2026-08 at user request (commented out, not deleted,
    // alongside its GameLobbyModal.jsx entry) — pending a hand-built 2D
    // replacement. Restore by uncommenting both plus the lazy import above.
    // case 'golf':
    //   // Arcade: single-player or hot-seat tournament, iframe-embedded (see
    //   // GolfGame.jsx header) — combines toad_ball's hot-seat precedence with
    //   // fowl_play's iframe/postMessage shape, since golf has no server-side
    //   // move logic of its own (a real Vercel-hosted fork, not a relay).
    //   // onRelayPacket/registerRelayReceiver carry the active player's live
    //   // ball-position updates to every spectator's own read-only mirror.
    //   return (
    //     <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
    //       <GolfGame
    //         onClose={onClose}
    //         onEndGame={onEndGame}
    //         onPlayAgain={onPlayAgain}
    //         isHost={activeGame.host_id === currentUserId}
    //         hotSeatTournament={hotSeatTournament}
    //         currentUserId={currentUserId}
    //         onTournamentScore={onTournamentScore}
    //         onRelayPacket={onRelayPacket}
    //         registerRelayReceiver={registerRelayReceiver}
    //       />
    //     </Suspense>
    //   );

    case 'slice_frenzy':
      // Arcade: single-player or hot-seat tournament — same self-contained
      // 2D canvas pattern as toad_ball, no server-side move logic and no
      // live spectator relay (a plain static "someone's playing" placeholder
      // is shown to non-playing members instead, same as space_attack).
      return (
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <SliceFrenzyGame
            onClose={onClose}
            onEndGame={onEndGame}
            onPlayAgain={onPlayAgain}
            isHost={activeGame.host_id === currentUserId}
            hotSeatTournament={hotSeatTournament}
            currentUserId={currentUserId}
            onTournamentScore={onTournamentScore}
          />
        </Suspense>
      );

    // case 'skeeball': temporarily removed
    //   // Arcade: single-player or hot-seat tournament — same shape as
    //   // slice_frenzy (self-contained canvas gameplay, no server move logic,
    //   // no live spectator relay).
    //   return (
    //     <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
    //       <SkeeballGame
    //         onClose={onClose}
    //         onEndGame={onEndGame}
    //         onPlayAgain={onPlayAgain}
    //         isHost={activeGame.host_id === currentUserId}
    //         hotSeatTournament={hotSeatTournament}
    //         currentUserId={currentUserId}
    //         onTournamentScore={onTournamentScore}
    //       />
    //     </Suspense>
    //   );

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
