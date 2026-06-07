// frontend/src/components/cinema/3d-cinema/ui/DiscussionModeBar.jsx
import React, { useState, useEffect } from 'react';
import './AudioModeBar.css';

// Desktop: solid white SVG for lecture (graduation cap)
function LectureIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z" />
    </svg>
  );
}

// Desktop: solid white SVG for discussion (two speech bubbles)
function DiscussionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M15 4v7H5l-2 2V4h12zm0-2H3c-1.1 0-2 .9-2 2v14l4-4h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      <path d="M21 8h-2v7H8v2c0 1.1.9 2 2 2h11l4 4V10c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

export default function DiscussionModeBar({
  discussionMode,
  isHost,
  onToggleMode,
  isSilenceMode,
  onToggleSilenceMode,
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

  const modeDesc = discussionMode
    ? 'Open floor · Everyone speaks and hears everyone'
    : 'Host: speaks to all, hears none · Members: hear host, speak with row';

  const visibilityClass = isVisible ? 'visible' : 'hidden';

  return (
    <div className="audio-mode-wrapper">
      <div
        className={`audio-mode-bar ${visibilityClass}`}
        style={{ position: 'relative', top: 'unset', left: 'unset', transform: 'none' }}
      >
        <div
          className="audio-mode-content"
          style={{
            borderColor: discussionMode
              ? 'rgba(239, 68, 68, 0.5)'
              : 'rgba(59, 130, 246, 0.5)',
          }}
        >
          {/* Mobile: emoji · Desktop: solid SVG */}
          <span className="audio-mode-icon md:hidden">
            {discussionMode ? '🗣️' : '🎓'}
          </span>
          <span className="audio-mode-icon hidden md:flex items-center text-white">
            {discussionMode ? <DiscussionIcon /> : <LectureIcon />}
          </span>

          <div className="audio-mode-label">
            <span className="audio-mode-text">
              {discussionMode ? 'Discussion Mode' : 'Lecture Mode'}
            </span>
          </div>

          {isHost && (
            <button
              className="audio-mode-toggle"
              onClick={handleToggle}
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              }}
              title={`Switch to ${discussionMode ? 'Lecture Mode' : 'Discussion Mode'}`}
            >
              {discussionMode ? 'Switch to Lecture Mode' : 'Switch to Discussion Mode'}
            </button>
          )}

          <span className="audio-mode-divider" />

          <button
            className={`audio-mode-silence ${isSilenceMode ? 'active' : ''}`}
            onClick={handleSilenceToggle}
            title={isSilenceMode ? 'Restore others\' audio' : 'Mute all other audio'}
          >
            {isSilenceMode ? '🔈 Quiet Mode' : '🤫 Quiet Mode'}
          </button>
        </div>
      </div>

      <p className={`audio-mode-description ${visibilityClass}`}>
        {modeDesc}
      </p>
    </div>
  );
}
