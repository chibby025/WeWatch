// frontend/src/components/cinema/3d-cinema/ui/AudioModeBar.jsx
import React, { useState, useEffect } from 'react';
import './AudioModeBar.css';

/**
 * AudioModeBar - Shows current audio mode at top of cinema screen
 * 
 * Features:
 * - Auto-hides after 1 second of inactivity
 * - Shows on mode change or mouse movement
 * - Host can toggle mode, users see status only
 * - Shows current row number
 */
export default function AudioModeBar({
  audioMode,           // 'seat' or 'party'
  currentRow,          // 0-5
  isHost,
  onToggleMode,        // Callback when host toggles mode
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Show bar when mode changes
  useEffect(() => {
    setIsVisible(true);
    setLastActivity(Date.now());
  }, [audioMode]);

  // Track mouse movement to show bar
  useEffect(() => {
    const handleMouseMove = () => {
      setIsVisible(true);
      setLastActivity(Date.now());
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Auto-hide after 1 second of inactivity
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      if (now - lastActivity > 1000) {
        setIsVisible(false);
      }
    };

    const interval = setInterval(checkInactivity, 100);
    return () => clearInterval(interval);
  }, [lastActivity]);

  const handleToggle = () => {
    if (!isHost) return;
    
    const newMode = audioMode === 'seat' ? 'party' : 'seat';
    onToggleMode(newMode);
    setLastActivity(Date.now());
  };

  const isSeatMode = audioMode === 'seat';
  const icon = isSeatMode ? '🎭' : '🎉';
  const modeText = isSeatMode ? 'Seat Mode' : 'Party Mode';
  const rowText = currentRow !== null ? ` (Row ${currentRow + 1})` : '';
  const buttonText = isSeatMode ? 'Party Mode' : 'Seat Mode';

  return (
    <div className={`audio-mode-bar ${isVisible ? 'visible' : 'hidden'}`}>
      <div className="audio-mode-content">
        <span className="audio-mode-icon">{icon}</span>
        <span className="audio-mode-text">
          {modeText}{isSeatMode && rowText}
        </span>
        
        {isHost && (
          <button 
            className="audio-mode-toggle"
            onClick={handleToggle}
            title={`Switch to ${buttonText}`}
          >
            {buttonText}
          </button>
        )}
        
        {!isHost && (
          <span className="audio-mode-status">
            {isSeatMode ? 'Row-based audio' : 'Everyone can hear everyone'}
          </span>
        )}
      </div>
    </div>
  );
}
