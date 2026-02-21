// src/components/cinema/3d-cinema/TouchViewControls.jsx
import React, { useState, useEffect } from 'react';

/**
 * TouchViewControls - Mobile touch zones for looking left/right in cinema
 * Left 15% and right 15% of screen are interactive zones
 * Center 70% is transparent (no interaction)
 */
export default function TouchViewControls({ onLookLeft, onLookRight, isMobile, currentCameraView }) {
  const [activeZone, setActiveZone] = useState(null); // 'left' | 'right' | null
  const [isVisible, setIsVisible] = useState(true);
  const fadeTimeoutRef = React.useRef(null);

  // Auto-fade after 5 seconds of inactivity
  useEffect(() => {
    if (activeZone) {
      setIsVisible(true);
      // Clear existing timeout
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
      // Set new timeout to fade
      fadeTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    }

    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, [activeZone]);

  // Show controls on any touch
  const handleTouchActivity = () => {
    setIsVisible(true);
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
    }
    fadeTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 5000);
  };

  const handleTouchStart = (zone, callback) => (e) => {
    e.preventDefault();
    setActiveZone(zone);
    handleTouchActivity();
    callback();
    
    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const handleTouchEnd = () => {
    setActiveZone(null);
  };

  if (!isMobile) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-30">
      {/* Left touch zone - hidden when at leftmost view */}
      {currentCameraView !== 'left' && (
        <button
          onTouchStart={handleTouchStart('left', onLookLeft)}
          onTouchEnd={handleTouchEnd}
          className={`absolute left-0 top-0 bottom-0 w-[15%] 
                     pointer-events-auto flex items-center justify-center
                     transition-all duration-300
                     ${isVisible ? 'bg-white/10' : 'bg-transparent'}
                     ${activeZone === 'left' ? 'bg-white/20' : ''}
                     backdrop-blur-sm`}
          aria-label="Look left"
        >
          <span 
            className={`text-white text-4xl transition-opacity duration-300
                       ${isVisible ? 'opacity-50' : 'opacity-0'}`}
          >
            ◄
          </span>
        </button>
      )}

      {/* Right touch zone - hidden when at rightmost view */}
      {currentCameraView !== 'right' && (
        <button
          onTouchStart={handleTouchStart('right', onLookRight)}
          onTouchEnd={handleTouchEnd}
          className={`absolute right-0 top-0 bottom-0 w-[15%] 
                     pointer-events-auto flex items-center justify-center
                     transition-all duration-300
                     ${isVisible ? 'bg-white/10' : 'bg-transparent'}
                     ${activeZone === 'right' ? 'bg-white/20' : ''}
                     backdrop-blur-sm`}
          aria-label="Look right"
        >
          <span 
            className={`text-white text-4xl transition-opacity duration-300
                       ${isVisible ? 'opacity-50' : 'opacity-0'}`}
          >
            ►
          </span>
        </button>
      )}

      {/* Center zone (70%) - transparent, shows controls on touch */}
      <div
        onTouchStart={handleTouchActivity}
        className="absolute inset-x-[15%] top-0 bottom-0 pointer-events-auto"
      />
    </div>
  );
}
