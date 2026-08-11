// src/components/Games/ObbyParkourGame.jsx
// Real N-player multiplayer: every room member who joins gets an identical,
// fully-playable instance — a fork of iErcann/Notblox (Modified MIT, only
// restriction is an irrelevant blockchain-use carve-out), a real Roblox-
// style parkour game (Three.js client, Rapier physics, real ECS server).
//
// Two-piece deployment, both forked: the game's own frontend (Next.js) on
// Vercel, and a genuinely new supervisor service on Railway — NotBlox's
// upstream server architecture is a SINGLE GLOBAL WORLD (EntityManager/
// PhysicsSystem/EventSystem are hard singletons, confirmed by reading
// back/src/index.ts directly), meaning every player who ever connects to
// one running instance shares the exact same physical space with no
// concept of "room" at all. The supervisor fixes this: a room-aware
// WebSocket proxy that lazily spawns a genuinely separate `back/` process
// per WeWatch room (keyed by the room id in the WS URL's path — that's
// already how the game's own client addresses a connection), proxies the
// connection through, and reaps the process once the room empties. Same
// architecture already proven for this project's Quake3 integration, a
// fresh implementation here for NotBlox's specific spawn shape.
import { useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const OBBY_ORIGIN = 'https://wewatch-obby-parkour.vercel.app';

export default function ObbyParkourGame({ roomId, onClose, onEndGame, isHost }) {
  const [loaded, setLoaded] = useState(false);

  const obbyUrl = `${OBBY_ORIGIN}/play/obby?room=${encodeURIComponent(roomId)}`;

  // Every player is a real, identical participant (no host/spectator
  // split, same as Quake3/Micro Racing) — a plain close only leaves the
  // course locally for that one player; the underlying room stays alive
  // for everyone else. Only the room host gets an explicit "End for
  // Everyone" action, which tears down the WeWatch-side GameSession for
  // the whole room first.
  const handleCloseClick = () => onClose?.();
  const handleEndForEveryone = () => { onEndGame?.(); onClose?.(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading Obby Parkour… (first load may take a moment)</p>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {isHost && (
          <button
            onClick={handleEndForEveryone}
            className="px-3 py-2 bg-red-700/80 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
            title="End the course for every player in the room"
          >
            End for Everyone
          </button>
        )}
        <button
          onClick={handleCloseClick}
          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
          title="Leave the course"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>
      <iframe
        src={obbyUrl}
        title="Obby Parkour"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
      />
    </div>
  );
}
