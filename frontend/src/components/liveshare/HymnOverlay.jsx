// frontend/src/components/liveshare/HymnOverlay.jsx
// Full-screen hymn lyrics overlay for church mode

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function HymnOverlay({ hymn, isActive, onDismiss, currentVerse = 1, sendMessage, sessionId }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive && hymn) {
      // Fade in animation
      setTimeout(() => setIsVisible(true), 50);
    } else {
      setIsVisible(false);
    }
  }, [isActive, hymn]);

  if (!isActive || !hymn) return null;

  // Get current verse to display
  const verse = hymn.verses?.[currentVerse - 1];
  if (!verse) return null;

  const textStyle = hymn.textStyle || {};
  
  // ✅ Broadcast clear to all members when X is clicked
  const handleClear = () => {
    if (sendMessage) {
      console.log('🎵 [HymnOverlay] Broadcasting clear to all members');
      sendMessage({
        type: 'hymn_update',
        data: {
          hymn: null,
          active: false
        }
      });
    }
    
    // Also call local dismiss handler if provided (for host preview)
    if (onDismiss) {
      onDismiss();
    }
  };

  // Apply text case transformation
  const applyTextCase = (text, textCase) => {
    if (!textCase || textCase === 'none') return text;
    
    switch (textCase) {
      case 'upper':
        return text.toUpperCase();
      case 'lower':
        return text.toLowerCase();
      case 'title':
        return text.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      case 'sentence':
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
      default:
        return text;
    }
  };

  const displayText = applyTextCase(verse.text, textStyle.case);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        backgroundColor: hymn.backgroundColor || 'rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Close button - broadcasts clear to all members */}
      <button
        onClick={handleClear}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
      >
        <X size={24} className="text-white" />
      </button>

      {/* Hymn content */}
      <div className="max-w-5xl px-4 sm:px-8 md:px-16 text-center space-y-4 sm:space-y-6 md:space-y-8 w-full">
        {/* Hymn title */}
        <h1
          className="font-bold tracking-wide text-xl sm:text-2xl md:text-3xl lg:text-4xl"
          style={{
            color: textStyle.titleColor || '#FFFFFF',
            fontSize: `clamp(20px, ${(textStyle.size || 32) + 8}px, ${(textStyle.size || 32) + 8}px)`,
            fontWeight: textStyle.weight || 700,
            textShadow: '3px 3px 6px rgba(0, 0, 0, 0.8)',
          }}
        >
          {hymn.title}
        </h1>

        {/* Verse text */}
        <div
          className="leading-relaxed whitespace-pre-line text-sm sm:text-base md:text-lg lg:text-xl"
          style={{
            color: textStyle.color || '#FFFFFF',
            fontSize: `clamp(16px, ${textStyle.size || 32}px, ${textStyle.size || 32}px)`,
            fontWeight: textStyle.weight || 400,
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
            lineHeight: '1.8',
          }}
        >
          {displayText}
        </div>

        {/* Verse indicator & author */}
        <div className="flex items-center justify-between opacity-80">
          <p
            className="text-sm"
            style={{
              color: textStyle.color || '#FFFFFF',
              fontSize: `${(textStyle.size || 32) * 0.5}px`,
            }}
          >
            {verse.type === 'chorus' ? 'Chorus' : `Verse ${verse.number}`}
          </p>
          
          {hymn.author && (
            <p
              className="text-sm italic"
              style={{
                color: textStyle.color || '#FFFFFF',
                fontSize: `${(textStyle.size || 32) * 0.5}px`,
              }}
            >
              - {hymn.author}
            </p>
          )}
        </div>

        {/* Verse navigation hint (host only) */}
        {onDismiss && hymn.verses && hymn.verses.length > 1 && (
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
              <p className="text-white text-xs opacity-60">
                Verse {currentVerse} of {hymn.verses.length} • Use controls to change verse
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
