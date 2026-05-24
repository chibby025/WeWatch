// frontend/src/components/cinema/3d-cinema/ui/DiscussionModeBar.jsx
import React, { useState, useEffect } from 'react';
import './AudioModeBar.css'; // Reuse AudioModeBar styles

export default function DiscussionModeBar({
  discussionMode,      // bool: true = discussion, false = lecture
  isHost,
  onToggleMode,        // () => void — host only
  isSilenceMode,       // bool
  onToggleSilenceMode, // () => void
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());

  useEffect(() => {
    setIsVisible(true);
    setLastActivity(Date.now());
  }, [discussionMode, isSilenceMode]);

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
    onToggleMode?.();
    setLastActivity(Date.now());
  };

  const handleSilenceToggle = () => {
    onToggleSilenceMode?.();
    setLastActivity(Date.now());
  };

  const modeIcon = discussionMode ? '🗣️' : '🎓';
  const modeText = discussionMode ? 'Discussion Mode' : 'Lecture Mode';

  return (
    <div className={`audio-mode-bar ${isVisible ? 'visible' : 'hidden'}`}>
      <div
        className="audio-mode-content"
        style={{
          borderColor: discussionMode
            ? 'rgba(239, 68, 68, 0.5)'
            : 'rgba(59, 130, 246, 0.5)',
        }}
      >
        <span className="audio-mode-icon">{modeIcon}</span>
        <span className="audio-mode-text">{modeText}</span>

        {isHost && (
          <button
            className="audio-mode-toggle"
            onClick={handleToggle}
            style={{
              background: discussionMode
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            }}
            title={`Switch to ${discussionMode ? 'Lecture Mode' : 'Discussion Mode'}`}
          >
            {discussionMode ? 'Lecture Mode' : 'Discussion Mode'}
          </button>
        )}

        <span className="audio-mode-divider" />

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
