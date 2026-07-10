// src/components/Games/FowlPlayGame.jsx
// Arcade: single-player duck-hunting mini-game, BunnyCDN-hosted static iframe.
// Built on MattSurabian/DuckHunt-JS (MIT). Renamed "Fowl Play" to avoid
// confusion with Nintendo's Duck Hunt trademark and the separate Steam VR
// game "Duck Season" (Stress Level Zero, 2017).
import { useEffect, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const FOWL_PLAY_ORIGIN = 'https://letswatchout.b-cdn.net';
const FOWL_PLAY_URL = `${FOWL_PLAY_ORIGIN}/games/fowl-play/v1/index.html`;

export default function FowlPlayGame({ onClose, onEndGame, isHost }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== FOWL_PLAY_ORIGIN) return;
      if (event.data?.type === 'fowlplay:exit') {
        onEndGame?.();
        onClose?.();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEndGame, onClose]);

  const handleExit = () => {
    onEndGame?.();
    onClose?.();
  };

  // Non-host members see a placeholder — no separate spectator mode exists
  // for this single-player arcade game.
  if (!isHost) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🦆</span>
        <p className="text-lg font-semibold">Someone's playing Fowl Play!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading Fowl Play…</p>
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
