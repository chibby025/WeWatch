import { useEffect, useState } from 'react';

// Shared, reusable "how to play" gesture tutorial — a brief animated overlay
// shown once per game type (persisted in localStorage) the first time that
// game is opened, with a manual replay entry point available via
// `resetControlsTutorial(gameType)`. Built once so every game needing this
// (Bowling, Tank Battle, Bomberman, Pool, and any future game) shares one
// implementation instead of a one-off overlay copy-pasted per file.
//
// Each `steps` entry is `{ icon: 'swipe-up' | 'swipe-lr' | 'drag' | 'tap' | 'joystick', text }`
// — the icon key selects a small looping CSS/SVG animation, `text` is the
// plain-language instruction shown beside it.

const STORAGE_PREFIX = 'wewatch_controls_tutorial_seen_';

// eslint-disable-next-line react-refresh/only-export-components -- same accepted cross-file data-export pattern already used by GameLobbyModal.jsx's getGameMeta
export function hasSeenControlsTutorial(gameType) {
  try { return localStorage.getItem(STORAGE_PREFIX + gameType) === 'true'; } catch { return false; }
}

// eslint-disable-next-line react-refresh/only-export-components
export function resetControlsTutorial(gameType) {
  try { localStorage.removeItem(STORAGE_PREFIX + gameType); } catch { /* ignore */ }
}

function markSeen(gameType) {
  try { localStorage.setItem(STORAGE_PREFIX + gameType, 'true'); } catch { /* ignore */ }
}

function GestureIcon({ kind }) {
  const common = { width: 56, height: 56, viewBox: '0 0 56 56', fill: 'none' };
  if (kind === 'swipe-up') {
    return (
      <svg {...common}>
        <style>{`
          @keyframes ctSwipeUp { 0% { transform: translateY(14px); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(-14px); opacity: 0; } }
        `}</style>
        <circle cx="28" cy="28" r="26" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <g style={{ animation: 'ctSwipeUp 1.4s ease-in-out infinite' }}>
          <circle cx="28" cy="34" r="7" fill="#22c55e" />
          <path d="M28 24 L28 8 M28 8 L21 15 M28 8 L35 15" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    );
  }
  if (kind === 'swipe-lr') {
    return (
      <svg {...common}>
        <style>{`
          @keyframes ctSwipeLR { 0% { transform: translateX(-12px); opacity: 0; } 20% { opacity: 1; } 50% { transform: translateX(12px); } 80% { opacity: 1; } 100% { transform: translateX(-12px); opacity: 0; } }
        `}</style>
        <circle cx="28" cy="28" r="26" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <g style={{ animation: 'ctSwipeLR 1.6s ease-in-out infinite' }}>
          <circle cx="28" cy="28" r="7" fill="#3b82f6" />
        </g>
        <path d="M12 28 L4 28 M4 28 L10 23 M4 28 L10 33" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M44 28 L52 28 M52 28 L46 23 M52 28 L46 33" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'drag') {
    return (
      <svg {...common}>
        <style>{`
          @keyframes ctDrag { 0% { transform: translate(-10px, 6px); opacity: 0.4; } 50% { transform: translate(10px, -6px); opacity: 1; } 100% { transform: translate(-10px, 6px); opacity: 0.4; } }
        `}</style>
        <circle cx="28" cy="28" r="26" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <g style={{ animation: 'ctDrag 1.6s ease-in-out infinite' }}>
          <circle cx="28" cy="28" r="8" fill="#f59e0b" />
        </g>
      </svg>
    );
  }
  if (kind === 'joystick') {
    return (
      <svg {...common}>
        <style>{`
          @keyframes ctJoy { 0% { transform: translate(0,0); } 25% { transform: translate(6px,-6px); } 50% { transform: translate(-6px,6px); } 75% { transform: translate(6px,6px); } 100% { transform: translate(0,0); } }
        `}</style>
        <circle cx="28" cy="28" r="26" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <g style={{ animation: 'ctJoy 2s ease-in-out infinite' }}>
          <circle cx="28" cy="28" r="10" fill="#a855f7" />
        </g>
      </svg>
    );
  }
  // 'tap' fallback
  return (
    <svg {...common}>
      <style>{`
        @keyframes ctTap { 0%, 100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(0.75); opacity: 0.5; } }
      `}</style>
      <circle cx="28" cy="28" r="26" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <circle cx="28" cy="28" r="10" fill="#ef4444" style={{ animation: 'ctTap 1s ease-in-out infinite', transformOrigin: '28px 28px' }} />
    </svg>
  );
}

/**
 * @param {string} gameType - localStorage key + used by the caller to gate showOnce
 * @param {Array<{icon: string, text: string}>} steps
 * @param {boolean} forceShow - bypass the "seen" check (used by a manual "replay tutorial" action)
 * @param {function} onDismiss
 */
export default function ControlsTutorialOverlay({ gameType, steps, forceShow = false, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceShow || !hasSeenControlsTutorial(gameType)) {
      setVisible(true);
    }
  }, [gameType, forceShow]);

  if (!visible || !steps?.length) return null;

  const close = () => {
    markSeen(gameType);
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={close}
    >
      <div
        className="bg-gray-900 rounded-2xl border border-white/10 shadow-2xl max-w-sm w-full p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-white font-bold text-center text-base">How to play</h3>
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-800/60 rounded-xl px-3 py-2">
              <GestureIcon kind={s.icon} />
              <p className="text-gray-200 text-sm leading-snug">{s.text}</p>
            </div>
          ))}
        </div>
        <button
          onClick={close}
          className="mt-1 w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-colors"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
