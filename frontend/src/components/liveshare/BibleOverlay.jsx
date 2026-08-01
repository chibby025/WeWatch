// frontend/src/components/liveshare/BibleOverlay.jsx
// Full-screen Bible verse overlay for church mode

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { API_BASE_URL } from '../../services/api';

export default function BibleOverlay({ verse, isActive, onDismiss, sendMessage, sessionId }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive && verse) {
      // Fade in animation
      setTimeout(() => setIsVisible(true), 50);
    } else {
      setIsVisible(false);
    }
  }, [isActive, verse]);

  if (!isActive || !verse) return null;
  
  // ✅ Broadcast clear to all members when X is clicked
  const handleClear = () => {
    if (sendMessage) {
      console.log('📖 [BibleOverlay] Broadcasting clear to all members');
      sendMessage({
        type: 'bible_verse_update',
        data: { 
          verse: null,
          active: false
        }
      });
    }
    
    // Clear from backend
    if (sessionId) {
      fetch(`${API_BASE_URL}/api/sessions/${sessionId}/bible-verse`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(err => console.error('Bible verse clear error:', err));
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

  const textStyle = verse.textStyle || {};
  const displayText = applyTextCase(verse.text, textStyle.case);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        backgroundColor: verse.backgroundColor || 'rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Close button - broadcasts clear to all members */}
      <button
        onClick={handleClear}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
      >
        <X size={24} className="text-white" />
      </button>

      {/* Bible verse content */}
      <div className="max-w-4xl px-4 sm:px-8 md:px-16 text-center space-y-4 sm:space-y-6 w-full">
        {/* Verse text */}
        <p
          className="leading-relaxed text-base sm:text-lg md:text-xl lg:text-2xl"
          style={{
            color: textStyle.color || '#FFFFFF',
            fontSize: `clamp(18px, ${textStyle.size || 32}px, ${textStyle.size || 32}px)`,
            fontWeight: textStyle.weight || 700,
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
          }}
        >
          "{displayText}"
        </p>

        {/* Verse reference */}
        <p
          className="opacity-90 text-sm sm:text-base md:text-lg"
          style={{
            color: textStyle.color || '#FFFFFF',
            fontSize: `clamp(14px, ${(textStyle.size || 32) * 0.6}px, ${(textStyle.size || 32) * 0.6}px)`,
            fontWeight: (textStyle.weight || 700) - 200,
          }}
        >
          — {verse.reference}
        </p>
      </div>
    </div>
  );
}
