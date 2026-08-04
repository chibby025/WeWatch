// WeWatch/frontend/src/components/EmojiPicker.jsx
// React wrapper for emoji-picker-element
import React, { useEffect, useRef } from 'react';
import 'emoji-picker-element';

// `height` defaults to a fixed 400px — every caller except StickerPicker just
// drops this in a plain <div> with no definite height of its own, so a
// percentage height would collapse to nothing there. StickerPicker's own
// wrapper *does* provide a definite, responsive height (see its maxHeight),
// so it explicitly passes height="100%" to adapt to smaller viewports there.
const EmojiPicker = ({ onEmojiSelect, className = '', height = '400px' }) => {
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
    <div className={`${className} h-full`}>
      {/* width/height set inline (per-instance) rather than in the shared <style>
          block below — that block uses a bare `emoji-picker` tag selector, which
          would apply to every mounted instance at once. Harmless for the theme
          custom-properties (always the same value everywhere), but would leak
          one instance's size onto another's now that height varies by caller. */}
      <emoji-picker ref={pickerRef} class="light" style={{ width: '100%', height }}></emoji-picker>
      <style>{`
        emoji-picker {
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
