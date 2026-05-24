// frontend/src/components/cinema/3d-cinema/ui/AudioModeBar.jsx
import React, { useState, useEffect } from 'react';
import './AudioModeBar.css';

export default function AudioModeBar({
  audioMode,           // 'seat' or 'party'
  currentRow,          // 0-5
  isHost,
  onToggleMode,        // Callback when host toggles mode
  isSilenceMode,       // bool
  onToggleSilenceMode, // () => void
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Show bar when mode or silence changes
  useEffect(() => {
    setIsVisible(true);
    setLastActivity(Date.now());
  }, [audioMode, isSilenceMode]);

  useEffect(() => {
    const handleMouseMove = () => {
      setIsVisible(true);
      setLastActivity(Date.now());
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Auto-hide after 3 seconds of inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > 3000) setIsVisible(false);
    }, 100);
    return () => clearInterval(interval);
  }, [lastActivity]);

  const handleToggle = () => {
    if (!isHost) return;
    const newMode = audioMode === 'seat' ? 'party' : 'seat';
    onToggleMode(newMode);
    setLastActivity(Date.now());
  };

  const handleSilenceToggle = () => {
    onToggleSilenceMode?.();
    setLastActivity(Date.now());
  };

  const isSeatMode = audioMode === 'seat';
  const modeIcon = isSeatMode ? '🎭' : '🎉';
  const modeText = isSeatMode ? 'Seat Mode' : 'Party Mode';
  const modeDesc = isSeatMode ? 'Only your row can hear you' : 'Everyone can hear you';
  const rowText = isSeatMode && currentRow !== null ? ` · Row ${currentRow + 1}` : '';

  return (
    <div className={`audio-mode-bar ${isVisible ? 'visible' : 'hidden'}`}>
      <div className="audio-mode-content">
        {/* Mode section */}
        <span className="audio-mode-icon">{modeIcon}</span>
        <div className="audio-mode-label">
          <span className="audio-mode-text">{modeText}{rowText}</span>
          <span className="audio-mode-status">{modeDesc}</span>
        </div>

        {/* Host: switch-mode button */}
        {isHost && (
          <button
            className="audio-mode-toggle"
            onClick={handleToggle}
            title={`Switch to ${isSeatMode ? 'Party' : 'Seat'} Mode`}
          >
            {isSeatMode ? 'Party Mode' : 'Seat Mode'}
          </button>
        )}

        {/* Divider */}
        <span className="audio-mode-divider" />

        {/* Silence toggle — available to everyone */}
        <button
          className={`audio-mode-silence ${isSilenceMode ? 'active' : ''}`}
          onClick={handleSilenceToggle}
          title={isSilenceMode ? 'Unmute others' : 'Watch in silence'}
        >
          {isSilenceMode ? '🔇 Silence' : '🔊 Silence'}
        </button>
      </div>
    </div>
  );
}
