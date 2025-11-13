import React, { useState, useEffect } from 'react';
import { Html } from '@react-three/drei';

/**
 * ChatBubble - Floating chat message above avatar
 * Features:
 * - Transparent bubble with white border
 * - Glowing text in user's avatar color
 * - 5-second display duration with fade-out
 * - 2-line max with truncation
 * - Illuminates dark cinema when lights are off
 */
export default function ChatBubble({
  message,
  color,
  position = [0, 1.8, 0],
  duration = 5000,
  onComplete,
}) {
  const [opacity, setOpacity] = useState(1);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Start fade-out 1 second before expiry
    const fadeTimer = setTimeout(() => {
      setOpacity(0);
    }, duration - 1000);

    // Remove bubble after full duration
    const removeTimer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [duration, onComplete]);

  if (!visible) return null;

  // Truncate message to 2 lines (approximately 50 characters)
  const truncatedMessage = message.length > 50 
    ? message.substring(0, 47) + '...'
    : message;

  return (
    <Html
      position={position}
      center
      distanceFactor={6}
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        transition: 'opacity 1s ease-out',
        opacity: opacity,
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.3)', // Transparent dark background
          border: '1px solid rgba(255, 255, 255, 0.8)', // White border
          borderRadius: '12px',
          padding: '8px 12px',
          maxWidth: '200px',
          position: 'relative',
          marginBottom: '8px',
        }}
      >
        {/* Message text with glow effect */}
        <div
          style={{
            color: color,
            fontSize: '13px',
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
            lineHeight: '1.3',
            textShadow: `
              0 0 10px ${color},
              0 0 20px ${color},
              0 0 30px ${color}
            `, // Triple glow for illumination effect
            display: '-webkit-box',
            WebkitLineClamp: 2, // Max 2 lines
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {truncatedMessage}
        </div>

        {/* Speech bubble tail (pointing down to avatar) */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid rgba(255, 255, 255, 0.8)',
          }}
        />
      </div>
    </Html>
  );
}
