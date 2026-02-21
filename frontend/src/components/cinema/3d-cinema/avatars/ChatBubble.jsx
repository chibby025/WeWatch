import React, { useState, useEffect } from 'react';
import { Html } from '@react-three/drei';

/**
 * ChatBubble - Floating chat message above avatar
 * Features:
 * - Transparent bubble with white border
 * - White text with colored glow
 * - 1.5-second display duration with fade-out
 * - Shows "username: message" format
 * - Illuminates dark cinema when lights are off
 */
export default function ChatBubble({
  message,
  username,
  color,
  position = [0, 1.8, 0],
  duration = 1500,
  onComplete,
}) {
  const [opacity, setOpacity] = useState(1);
  const [visible, setVisible] = useState(true);

  // 🐛 Debug logging
  useEffect(() => {
    console.log('💬 [ChatBubble] MOUNTED with props:', { message, username, color, position, duration });
    return () => {
      console.log('💬 [ChatBubble] UNMOUNTED for:', username);
    };
  }, []);

  useEffect(() => {
    console.log('💬 [ChatBubble] Props CHANGED:', { message, username, color });
  }, [message, username, color]);

  useEffect(() => {
    console.log('💬 [ChatBubble] Opacity changed to:', opacity);
  }, [opacity]);

  useEffect(() => {
    console.log('💬 [ChatBubble] Visible changed to:', visible);
  }, [visible]);

  useEffect(() => {
    // Start fade-out 500ms before expiry
    const fadeTimer = setTimeout(() => {
      setOpacity(0);
    }, duration - 500);

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

  // Format: "username: message"
  const displayText = username ? `${username}: ${message}` : message;
  
  // Truncate message to 2 lines (approximately 25 characters for 16px base font)
  const truncatedMessage = displayText.length > 25 
    ? displayText.substring(0, 22) + '...'
    : displayText;

  return (
    <Html
      position={position}
      center
      transform // ✅ Use transform mode for consistent screen-space size
      sprite // ✅ Make it always face camera (billboard effect)
      occlude={false} // ✅ Prevent z-fighting that can cause blur
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        transition: 'opacity 1s ease-out',
        opacity: opacity,
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '10px',
          padding: '5px 10px',
          maxWidth: '170px',
          position: 'relative',
          marginBottom: '10px',
          transform: 'scale(0.32)', // ✅ Reduced from 0.4 to 0.32 (20% smaller: 0.4 × 0.8)
          transformOrigin: 'center bottom',
        }}
      >
        {/* Message text with glow effect */}
        <div
          style={{
            color: '#ffffff',
            fontSize: '16px', // ✅ Large base font for maximum sharpness
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
            lineHeight: '1.3',
            textShadow: `
              0 0 12px ${color},
              0 0 20px ${color},
              0 0 32px ${color},
              0 2px 4px rgba(0, 0, 0, 0.8)
            `, // ✅ Proportional glow for 16px font
            display: '-webkit-box',
            WebkitLineClamp: 2,
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
            bottom: '-10px', // ✅ Proportional to base size
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '10px solid transparent', // ✅ Proportional
            borderRight: '10px solid transparent',
            borderTop: '10px solid rgba(255, 255, 255, 0.8)',
          }}
        />
      </div>
    </Html>
  );
}
