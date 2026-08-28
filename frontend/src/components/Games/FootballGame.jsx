// src/components/Games/FootballGame.jsx
// Arcade mode: a real 3D single-player match (host vs AI), forked from
// Shahriyarrrrr/world-cup-arena (MIT), hosted as a single self-contained
// static HTML file on BunnyCDN — same isolation rationale as DOOM/Quake3
// (keep a third-party game's own code out of the main JS bundle). Unlike
// DOOM, this engine has no networking of its own at all (no client/server
// split, pure local keyboard/gamepad input) and no natural "match over"
// exit hook, so this is intentionally the simple shape: host plays inside
// the iframe, every other room member sees a static "watching" placeholder
// — not a live relay. A host-triggered close always ends the game for
// everyone, since there's no local/spectator distinction to preserve.
import { useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const FOOTBALL_URL = 'https://letswatchout.b-cdn.net/games/football/index.html';

export default function FootballGame({ onClose, onEndGame, isHost, hostUsername }) {
  const [loaded, setLoaded] = useState(false);

  const handleExitClick = () => {
    // Every viewer's exit ends the match — there is no independent
    // "keep playing without me" state for anyone but the host anyway.
    onEndGame?.();
    onClose?.();
  };

  if (!isHost) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black text-white">
        <span className="text-6xl">⚽</span>
        <p className="text-sm text-gray-300">
          {hostUsername ? `${hostUsername} is playing Football…` : 'The host is playing Football…'}
        </p>
        <p className="text-xs text-gray-500">Just here to watch — grab a seat.</p>
        <button
          onClick={() => onClose?.()}
          className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
        >
          Stop watching
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading the match…</p>
        </div>
      )}
      <button
        onClick={handleExitClick}
        className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/90 hover:bg-red-700 text-white text-sm font-medium transition-colors"
        title="End match for everyone"
      >
        <CloseIcon className="w-4 h-4" />
        End Game
      </button>
      <iframe
        src={FOOTBALL_URL}
        title="Football"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="gamepad; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      />
    </div>
  );
}
