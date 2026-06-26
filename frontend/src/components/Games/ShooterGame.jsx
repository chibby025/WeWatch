// src/components/Games/ShooterGame.jsx
// Real simultaneous multiplayer (not host+spectator like DOOM) — every room
// member who joins gets an actual player in the match. The game server is a
// separate Node.js + ws + ecsy service deployed on Railway (its own
// authoritative physics/combat simulation; never routed through WeWatch's
// backend). This wrapper's only job is the iframe + the WeWatch room id,
// passed as a query param so the server's per-room world routing (see
// space-shooter's server/src/index.js) puts everyone from the same WeWatch
// room into the same isolated match.
import { useState } from 'react';
import { X as CloseIcon } from 'lucide-react';
import { checkDevicePerformance, hasDismissedLowEndWarning, dismissLowEndWarning } from '../../utils/devicePerformance';

const SHOOTER_BASE_URL = 'https://space-shooter-production-6e0d.up.railway.app';

export default function ShooterGame({ onClose, onEndGame, isHost, roomId }) {
  const [loaded, setLoaded] = useState(false);
  const [showLowEndWarning, setShowLowEndWarning] = useState(() => {
    const { isLowEnd } = checkDevicePerformance();
    return isLowEnd && !hasDismissedLowEndWarning('space_shooter');
  });
  const shooterUrl = `${SHOOTER_BASE_URL}/?room=${encodeURIComponent(roomId)}`;

  const dismissWarning = () => {
    dismissLowEndWarning('space_shooter');
    setShowLowEndWarning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {showLowEndWarning && (
        <div className="absolute top-4 left-4 z-20 max-w-sm bg-amber-900/90 border border-amber-600/60 text-amber-100 text-sm rounded-lg p-3 flex items-start gap-2">
          <span className="flex-1">This game may run slowly on your device. It'll still load — just a heads up.</span>
          <button onClick={dismissWarning} className="text-amber-300 hover:text-white flex-shrink-0">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Launching the match…</p>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {isHost && (
          <button
            onClick={() => { onEndGame?.(); onClose?.(); }}
            className="px-3 py-2 bg-red-600/80 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
            title="Ends the match for everyone in the room"
          >
            End for Everyone
          </button>
        )}
        <button
          onClick={() => onClose?.()}
          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
          title="Leave match (others keep playing)"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>
      <iframe
        src={shooterUrl}
        title="Space Shooter"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
