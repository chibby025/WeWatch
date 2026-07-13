// src/components/Games/FowlPlayGame.jsx
// Arcade: single-player duck-hunting mini-game, BunnyCDN-hosted static iframe.
// Built on MattSurabian/DuckHunt-JS (MIT). Renamed "Fowl Play" to avoid
// confusion with Nintendo's Duck Hunt trademark and the separate Steam VR
// game "Duck Season" (Stress Level Zero, 2017).
import { useEffect, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const FOWL_PLAY_ORIGIN = 'https://letswatchout.b-cdn.net';
const FOWL_PLAY_URL = `${FOWL_PLAY_ORIGIN}/games/fowl-play/v3/index.html`;

export default function FowlPlayGame({
  onClose,
  onEndGame,
  isHost,
  // Hot-seat tournament props
  hotSeatTournament = null,    // full tournament state object or null
  currentUserId = null,
  onTournamentScore = null,    // callback(score) when this player finishes
}) {
  const [loaded, setLoaded] = useState(false);
  const [myScore, setMyScore] = useState(null);

  // Derived: is it currently this user's turn in a hot-seat tournament?
  const isMyTurn = hotSeatTournament &&
    hotSeatTournament.current_player_id === currentUserId;

  const isInTournament = !!hotSeatTournament;

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== FOWL_PLAY_ORIGIN) return;
      const { type, score, won } = event.data || {};

      if (type === 'fowlplay:exit') {
        onEndGame?.();
        onClose?.();
        return;
      }

      if (type === 'fowlplay:gameover') {
        setMyScore(score ?? 0);
        if (isInTournament && onTournamentScore) {
          onTournamentScore(score ?? 0);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEndGame, onClose, isInTournament, onTournamentScore]);

  const handleExit = () => {
    onEndGame?.();
    onClose?.();
  };

  // ─── Non-host / waiting players ─────────────────────────────────────────────
  if (!isHost) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? 'someone';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🦆</span>
        {isInTournament ? (
          <>
            <p className="text-lg font-semibold">
              {currentPlayerName}'s turn — Fowl Play
            </p>
            <p className="text-sm text-gray-400">
              Stand by for your turn…
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">Someone's playing Fowl Play!</p>
            <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
          </>
        )}
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // ─── Host in tournament: not their turn yet ──────────────────────────────────
  if (isInTournament && !isMyTurn && myScore === null) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? '…';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">⏳</span>
        <p className="text-lg font-semibold">
          Waiting for {currentPlayerName} to play…
        </p>
        <p className="text-sm text-gray-400">You'll be up soon!</p>
        <button
          onClick={handleExit}
          className="mt-4 px-5 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-sm transition-colors"
        >
          Cancel Tournament
        </button>
      </div>
    );
  }

  // ─── Score recorded — waiting for other players ──────────────────────────────
  if (isInTournament && myScore !== null) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🎯</span>
        <p className="text-lg font-semibold">Your score: {myScore.toLocaleString()}</p>
        <p className="text-sm text-gray-400">Waiting for other players to finish…</p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // ─── Active play ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading Fowl Play…</p>
        </div>
      )}

      {/* Tournament turn banner */}
      {isInTournament && loaded && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-purple-700/90 text-white text-sm font-semibold rounded-full shadow">
          🏆 Your turn — shoot as many ducks as you can!
        </div>
      )}

      <button
        onClick={handleExit}
        className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
        title="End game"
      >
        <CloseIcon className="w-6 h-6" />
      </button>

      <iframe
        src={FOWL_PLAY_URL}
        title="Fowl Play"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
