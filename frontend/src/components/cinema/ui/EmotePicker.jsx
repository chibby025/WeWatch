import React from 'react';
import EmojiImage from './EmojiImage';

/**
 * EmotePicker - Dropdown emote selector
 * Features:
 * - Grid of emoji buttons
 * - Click to send emote
 * - Keyboard shortcuts shown
 * - Raise hand action (special emote)
 */
export default function EmotePicker({ isOpen, onClose, onEmoteSelect, onToggleRaiseHand, isHandRaised }) {
  if (!isOpen) return null;

  const emotes = [
    { id: 'raise_hand', emoji: '✋', label: isHandRaised ? 'Lower Hand' : 'Raise Hand', key: 'R', isAction: true },
    { id: 'thumbs_up', emoji: '👍', label: 'Thumbs Up', key: '1' },
    { id: 'heart', emoji: '❤️', label: 'Heart', key: '2' },
    { id: 'laugh', emoji: '😂', label: 'Laugh', key: '3' },
    { id: 'celebrate', emoji: '🎉', label: 'Celebrate', key: '4' },
    { id: 'fire', emoji: '🔥', label: 'Fire', key: '5' },
    { id: 'clap', emoji: '👏', label: 'Clap', key: '6' },
  ];

  const handleEmoteClick = (emote) => {
    if (emote.isAction && emote.id === 'raise_hand') {
      // Special action: raise/lower hand
      if (onToggleRaiseHand) {
        onToggleRaiseHand();
      }
    } else {
      // Regular emote: send to room
      onEmoteSelect(emote.id);
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop - closes on click */}
      <div
        className="fixed inset-0 z-[999]"
        onClick={onClose}
      />

      {/* Emote picker dropdown */}
      <div
        className="fixed bottom-16 sm:bottom-20 left-1/2 transform -translate-x-1/2 z-[1000] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 sm:p-4 w-[95vw] max-w-md sm:max-w-lg lg:max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap justify-center gap-1 sm:gap-2">
          {emotes.map((emote) => (
            <button
              key={emote.id}
              onClick={() => handleEmoteClick(emote)}
              className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl transition-all duration-150 group ${
                emote.isAction && isHandRaised
                  ? 'bg-yellow-500/20 hover:bg-yellow-500/30'
                  : 'bg-transparent hover:bg-white/8'
              }`}
              title={`${emote.label}${emote.key !== 'R' ? ` (Key: ${emote.key})` : ''}`}
            >
              <div className="group-hover:scale-125 transition-transform duration-150 drop-shadow-[0_0_6px_rgba(255,255,255,0.25)] group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">
                <EmojiImage
                  emoji={emote.emoji}
                  size={emote.id === 'heart'
                    ? (window.innerWidth < 640 ? 52 : 72)
                    : (window.innerWidth < 640 ? 40 : 56)}
                />
              </div>
              <span className="text-[10px] text-gray-400 mt-1 group-hover:text-gray-200 transition-colors">{emote.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
