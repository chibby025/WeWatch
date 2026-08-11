// src/components/Games/MicroRacingGame.jsx
// Real N-player multiplayer: every room member who joins gets an identical,
// fully-playable instance — a fork of Mati365/micro-racing (MIT), a real
// isometric kart racer with its own server-authoritative physics, client-
// side prediction, real room/chat/kick-ban system, and AI bot opponents.
// Deployed as its own persistent Railway service (holds long-lived
// WebSocket connections + in-memory room state — not Vercel/serverless-
// friendly, unlike Golf). Same isolation rationale as every other forked
// game in this roster.
//
// Room scoping: the fork's own client reads `?room=<id>` from its OWN URL
// (added specifically for this integration — see ScreensContainer.jsx's
// AutoJoinRoomFromURL in the fork) and auto-joins-or-creates a race room
// deterministically addressed by that exact id (Server#createRoom/
// PlayerSocket#joinRoom patched to accept a caller-chosen room id instead
// of always generating a random one) — no separate WS-supervisor layer
// needed, unlike Quake3, since this fork's own single Node process already
// holds real room state directly.
import { useEffect, useRef, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const MICRO_RACING_ORIGIN = 'https://micro-racing-production-0efd.up.railway.app';

export default function MicroRacingGame({ roomId, onClose, onEndGame, isHost }) {
  const [loaded, setLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const iframeRef = useRef(null);

  const raceUrl = `${MICRO_RACING_ORIGIN}/?room=${encodeURIComponent(roomId)}`;

  // Shown once per load, to every player (not just the host, unlike DOOM/
  // Quake3) — everyone drives their own car here, so everyone needs the
  // keyboard scheme. This game has no built-in touch controls at all (a
  // real limitation, not a gating oversight) — a mobile player still gets
  // the popup, since there's nothing better to show them either way.
  useEffect(() => {
    if (loaded) setShowControls(true);
  }, [loaded]);

  // Every player is a real, identical participant (no host/spectator split,
  // same as Quake3) — a plain close only leaves the race locally for that
  // one player; the underlying race room stays alive for everyone else.
  // Only the room host gets an explicit "End for Everyone" action, which
  // tears down the WeWatch-side GameSession for the whole room first.
  const handleCloseClick = () => onClose?.();
  const handleEndForEveryone = () => { onEndGame?.(); onClose?.(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading Micro Racing… (first load may take a moment)</p>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {isHost && (
          <button
            onClick={handleEndForEveryone}
            className="px-3 py-2 bg-red-700/80 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
            title="End the race for every player in the room"
          >
            End for Everyone
          </button>
        )}
        <button
          onClick={handleCloseClick}
          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
          title="Leave the race"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src={raceUrl}
        title="Micro Racing"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
      {showControls && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/70"
          onClick={() => setShowControls(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm mx-4 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-3">Controls</h3>
            <div className="space-y-1.5 text-sm text-gray-200">
              <div className="flex justify-between gap-4"><span className="text-gray-400">Accelerate</span><span>W or Up</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Brake / Reverse</span><span>S or Down</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Steer</span><span>A/D or Left/Right</span></div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              The room owner picks the track and player count, and can add AI bots to fill empty slots before starting the race.
            </p>
            <button
              onClick={() => setShowControls(false)}
              className="mt-4 w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white text-sm font-medium py-2 rounded-lg transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
