
import React, { useState } from 'react';
import EmojiPicker from 'emoji-picker-react';

const ReactionButton = ({ onReaction, disabled }) => {
  const [showPicker, setShowPicker] = useState(false);

  const handleReaction = (emojiData) => {
    if (onReaction && !disabled) {
      onReaction(emojiData.emoji);
      setShowPicker(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker(!showPicker)}
        disabled={disabled}
        className={`p-2 rounded-full transition-colors duration-200 ${
          disabled 
            ? 'bg-gray-300 cursor-not-allowed' 
            : 'bg-gray-200 hover:bg-gray-300'
        }`}
        title="Send reaction"
      >
        <span className="text-xl">😊</span>
      </button>

      {showPicker && (
        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-40">
          <EmojiPicker 
            onEmojiClick={handleReaction}
            theme="light"
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
};

export default ReactionButton;