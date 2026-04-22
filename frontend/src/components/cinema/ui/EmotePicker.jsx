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
        <h3 className="text-white text-xs sm:text-sm font-bold mb-2 sm:mb-3 text-center">
          😊 Send Emote
        </h3>

        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-1 sm:gap-2">
          {emotes.map((emote) => (
            <button
              key={emote.id}
              onClick={() => handleEmoteClick(emote)}
              className={`flex flex-col items-center justify-center p-1.5 sm:p-2 md:p-3 rounded-lg transition-colors group ${
                emote.isAction && isHandRaised 
                  ? 'bg-yellow-600 hover:bg-yellow-700' 
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
              title={`${emote.label}${emote.key !== 'R' ? ` (Key: ${emote.key})` : ''}`}
            >
              <div className="mb-0.5 sm:mb-1 group-hover:scale-110 transition-transform">
                <EmojiImage emoji={emote.emoji} size={window.innerWidth < 640 ? 32 : 48} />
              </div>
              <div className="text-[8px] sm:text-[9px] text-gray-400 text-center leading-tight">{emote.label}</div>
              {emote.key !== 'R' && (
                <div className="text-[7px] sm:text-[8px] text-gray-500 mt-0.5 hidden sm:block">Key: {emote.key}</div>
              )}
            </button>
          ))}
        </div>

        <div className="mt-2 sm:mt-3 text-center text-[9px] sm:text-[10px] text-gray-500">
          {isHandRaised ? '✋ Your hand is raised' : 'Use keyboard shortcuts (1-6) for quick reactions'}
        </div>
      </div>
    </>
  );
}
