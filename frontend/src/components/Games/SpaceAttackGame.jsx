import React, { useState, useEffect, useRef } from 'react';

const SPACE_ATTACK_URL = 'https://letswatchout.b-cdn.net/games/space-attack/v1/index.html';

export default function SpaceAttackGame({ onClose, onEndGame, isHost }) {
  const iframeRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const isTouchDevice = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== new URL(SPACE_ATTACK_URL).origin) return;
      if (e.data?.type === 'space_attack:exit') {
        onClose?.();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);

  useEffect(() => {
    if (loaded && !isTouchDevice) {
      setShowControls(true);
    }
  }, [loaded, isTouchDevice]);

  return (
    <div className="relative flex flex-col h-full bg-black">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/80 border-b border-gray-800 z-10">
        <span className="text-purple-300 font-bold text-sm">Space Attack</span>
        <div className="flex gap-2">
          {isHost && onEndGame && (
            <button
              onClick={onEndGame}
              className="px-3 py-1 text-xs bg-red-700 hover:bg-red-800 rounded text-white"
            >
              End for Everyone
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white"
          >
            ✕ Exit
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {!loaded && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black gap-3">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-purple-300 text-sm">Loading Space Attack…</p>
        </div>
      )}

      {/* Controls popup (desktop only, dismissible) */}
      {showControls && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-gray-900/95 border border-gray-700 rounded-xl p-4 shadow-2xl w-64 text-center">
          <p className="font-bold text-white mb-2 text-sm">🎮 Controls</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300 text-left mb-3">
            <span>← / → Arrow</span><span>Move ship</span>
            <span>Space</span><span>Fire</span>
            <span>P</span><span>Pause</span>
          </div>
          <button
            onClick={() => setShowControls(false)}
            className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-white text-xs font-bold"
          >
            Got it!
          </button>
        </div>
      )}

      {/* Game iframe */}
      <iframe
        ref={iframeRef}
        src={SPACE_ATTACK_URL}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin"
        title="Space Attack"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
