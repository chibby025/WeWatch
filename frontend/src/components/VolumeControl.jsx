// src/components/VolumeControl.jsx
import React, { useState, useEffect } from 'react';

/**
 * Volume Control Component - Shows on hover over video
 * Displays volume slider and mute button for uploaded media playback
 */
export default function VolumeControl({ videoRef, onDismiss }) {
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('wewatch_video_volume');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('wewatch_video_muted');
    return saved === 'true';
  });

  // Apply volume to video element when it changes
  useEffect(() => {
    if (videoRef?.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted, videoRef]);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('wewatch_video_volume', volume);
    localStorage.setItem('wewatch_video_muted', isMuted);
  }, [volume, isMuted]);

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return '🔇';
    if (volume < 0.5) return '🔉';
    return '🔊';
  };

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-md rounded-lg px-3 py-4 flex flex-col items-center gap-3 shadow-xl border border-gray-700 z-50">
      {/* Volume percentage */}
      <span className="text-white text-sm font-medium">
        {Math.round((isMuted ? 0 : volume) * 100)}%
      </span>

      {/* Vertical Volume slider */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={isMuted ? 0 : volume}
        onChange={handleVolumeChange}
        className="h-32 w-1 bg-gray-600 rounded-lg appearance-none cursor-pointer volume-slider"
        style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
        aria-label="Volume"
      />

      {/* Mute button */}
      <button
        onClick={toggleMute}
        className="text-2xl hover:scale-110 transition-transform"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {getVolumeIcon()}
      </button>

      {/* Dismiss button — centered at the bottom, like a cap */}
      <button
        onClick={() => onDismiss?.()}
        className="text-gray-400 hover:text-white text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
        aria-label="Close volume control"
      >
        ×
      </button>

      <style jsx>{`
        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          transition: all 0.2s;
        }
        .volume-slider::-webkit-slider-thumb:hover {
          background: #c084fc;
          transform: scale(1.2);
        }
        .volume-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .volume-slider::-moz-range-thumb:hover {
          background: #c084fc;
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
}
