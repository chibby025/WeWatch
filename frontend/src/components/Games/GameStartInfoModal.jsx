// src/components/Games/GameStartInfoModal.jsx
//
// A brief, auto-dismissing "here's what you're about to play" intro shown
// the instant any game genuinely starts — reuses each game's own poster
// (GameLobbyModal.jsx's picker) and rules text (GameRulesButton.jsx's RULES
// map) rather than maintaining a third copy of either. Deliberately generic
// over gameType so every game gets this for free (see GameOverlay.jsx's
// wrapper), not just one.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { RULES } from './GameRulesButton';
import { getGameMeta } from './GameLobbyModal';

const AUTO_DISMISS_MS = 2000;

export default function GameStartInfoModal({ gameType, onDismiss }) {
  const [closing, setClosing] = useState(false);
  const dismissedRef = useRef(false);

  const meta = getGameMeta(gameType);
  const ruleSet = RULES[gameType];
  const title = ruleSet?.title || meta?.name || gameType;

  const close = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setClosing(true);
    // Let the fade-out transition finish before actually unmounting (via
    // the parent's onDismiss), rather than popping out instantly.
    setTimeout(onDismiss, 200);
  };

  useEffect(() => {
    const t = setTimeout(close, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm transition-opacity duration-200 ${
        closing ? 'opacity-0' : 'opacity-100 animate-fade-in'
      }`}
      onClick={close}
      role="button"
      tabIndex={-1}
    >
      <div
        className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col sm:flex-row max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-2 right-2 z-10 text-gray-300 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-1"
          title="Skip"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Poster — fixed in place; the whole point is instructions scroll
            underneath/beside it, never the image itself. */}
        {meta?.image && (
          <div className="sm:w-2/5 shrink-0 h-40 sm:h-auto bg-black/40">
            <img src={meta.image} alt={title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col p-5">
          <h2 className="text-white text-xl font-bold mb-3 shrink-0">{title}</h2>
          <div className="overflow-y-auto pr-1">
            {ruleSet?.rules?.length ? (
              <ul className="space-y-2">
                {ruleSet.rules.map((rule, i) => (
                  <li key={i} className="text-gray-300 text-sm leading-relaxed flex gap-2">
                    <span className="text-purple-400 shrink-0">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400 text-sm">Get ready!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
