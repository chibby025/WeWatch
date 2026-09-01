// src/components/Games/TeeworldsGame.jsx
// Real N-player multiplayer: every room member who joins gets an
// identical, fully-playable instance — a WASM/Emscripten port of the real
// Teeworlds engine (zlib-style license, more permissive than this
// project's own GPL-licensed ports — full commercial use permitted, no
// attribution required beyond not misrepresenting the origin).
//
// Same two-piece architecture already proven for Quake3/Micro Racing/Obby
// Parkour: the game client (a static WASM build — Emscripten's own
// transparent UDP-socket-over-WebSocket emulation, confirmed working via
// direct testing to already handle Teeworlds' real netcode with zero
// custom relay/bridge code needed, unlike DOOM) is hosted on Vercel; a
// genuinely new supervisor service on Railway is a room-aware WS proxy
// that lazily spawns a separate dedicated teeworlds_srv process per
// WeWatch room (keyed by ?room=<id>), routes traffic to it, and reaps the
// process once the room empties — confirmed via a real production test
// with two concurrent rooms that this genuinely produces two independent
// server processes with zero cross-room leakage.
import { useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const TEEWORLDS_ORIGIN = 'https://wewatch-teeworlds.vercel.app';

export default function TeeworldsGame({ roomId, onClose, onEndGame, isHost }) {
  const [loaded, setLoaded] = useState(false);

  const teeworldsUrl = `${TEEWORLDS_ORIGIN}/?room=${encodeURIComponent(roomId)}`;

  // Every player is a real, identical participant (no host/spectator
  // split, same as Quake3/Micro Racing/Obby Parkour) — a plain close only
  // leaves the match locally for that one player; the underlying room's
  // dedicated server stays alive for everyone else. Only the room host
  // gets an explicit "End for Everyone" action, which tears down the
  // WeWatch-side GameSession for the whole room first.
  const handleCloseClick = () => onClose?.();
  const handleEndForEveryone = () => { onEndGame?.(); onClose?.(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading Teeworlds… (first load may take a moment)</p>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {isHost && (
          <button
            onClick={handleEndForEveryone}
            className="px-3 py-2 bg-red-700/80 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
            title="End the match for every player in the room"
          >
            End for Everyone
          </button>
        )}
        <button
          onClick={handleCloseClick}
          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
          title="Leave the match"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>
      <iframe
        src={teeworldsUrl}
        title="Teeworlds"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      />
    </div>
  );
}
