import React from 'react';

/**
 * EmotePicker - Dropdown emote selector
 * Features:
 * - Grid of emoji buttons
 * - Click to send emote
 * - Keyboard shortcuts shown
 */
export default function EmotePicker({ isOpen, onClose, onEmoteSelect }) {
  if (!isOpen) return null;

  const emotes = [
    { id: 'wave', emoji: '👋', label: 'Wave', key: '1' },
    { id: 'clap', emoji: '👏', label: 'Clap', key: '2' },
    { id: 'thumbs_up', emoji: '👍', label: 'Thumbs Up', key: '3' },
    { id: 'laugh', emoji: '😂', label: 'Laugh', key: '4' },
    { id: 'heart', emoji: '❤️', label: 'Heart', key: '5' },
  ];

  const handleEmoteClick = (emoteId) => {
    onEmoteSelect(emoteId);
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
        className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[1000] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-white text-sm font-bold mb-3 text-center">
          😊 Send Emote
        </h3>

        <div className="grid grid-cols-5 gap-2">
          {emotes.map((emote) => (
            <button
              key={emote.id}
              onClick={() => handleEmoteClick(emote.id)}
              className="flex flex-col items-center justify-center p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors group"
              title={`${emote.label} (Key: ${emote.key})`}
            >
              <div className="text-3xl mb-1 group-hover:scale-110 transition-transform">
                {emote.emoji}
              </div>
              <div className="text-[9px] text-gray-400">{emote.label}</div>
              <div className="text-[8px] text-gray-500 mt-0.5">Key: {emote.key}</div>
            </button>
          ))}
        </div>

        <div className="mt-3 text-center text-[10px] text-gray-500">
          Or use keyboard shortcuts (1-5)
        </div>
      </div>
    </>
  );
}
