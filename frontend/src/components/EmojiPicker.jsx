// WeWatch/frontend/src/components/EmojiPicker.jsx
// React wrapper for emoji-picker-element
import React, { useEffect, useRef } from 'react';
import 'emoji-picker-element';

const EmojiPicker = ({ onEmojiSelect, className = '' }) => {
  const pickerRef = useRef(null);

  useEffect(() => {
    const picker = pickerRef.current;
    
    if (picker) {
      const handleEmojiClick = (event) => {
        if (onEmojiSelect) {
          onEmojiSelect(event.detail.unicode);
        }
      };

      picker.addEventListener('emoji-click', handleEmojiClick);

      return () => {
        picker.removeEventListener('emoji-click', handleEmojiClick);
      };
    }
  }, [onEmojiSelect]);

  return (
    <div className={className}>
      <emoji-picker ref={pickerRef} class="light"></emoji-picker>
      <style>{`
        emoji-picker {
          width: 100%;
          height: 400px;
          --background: rgb(17 24 39);
          --border-color: rgb(55 65 81);
          --indicator-color: rgb(168 85 247);
          --input-border-color: rgb(75 85 99);
          --input-font-color: rgb(243 244 246);
          --input-placeholder-color: rgb(156 163 175);
          --input-border-radius: 0.5rem;
          --category-emoji-size: 1.5rem;
          --category-font-color: rgb(209 213 219);
          --emoji-size: 1.75rem;
          --num-columns: 8;
          --outline-color: rgb(168 85 247);
          --search-background: rgb(31 41 55);
          --search-icon-color: rgb(156 163 175);
        }
      `}</style>
    </div>
  );
};

export default EmojiPicker;
