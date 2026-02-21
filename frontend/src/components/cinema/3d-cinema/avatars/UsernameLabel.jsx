import React from 'react';
import { Html } from '@react-three/drei';

/**
 * UsernameLabel - Floating username above avatar
 * Features:
 * - Billboard effect (always faces camera)
 * - Styled with user's avatar color
 * - Premium indicator (⭐)
 * - Current user indicator (YOU)
 * - Speaker indicator (🎤) when user is speaking
 */
export default function UsernameLabel({
  username,
  color,
  position = [0, 1.4, 0],
  isPremium = false,
  isCurrentUser = false,
  isSpeaking = false, // 🎤 Show microphone icon when speaking
}) {
  return (
    <Html
      position={position}
      center
      distanceFactor={5} // ✅ Reduced from 20 to 5 (divided by 4 for smaller size)
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.7)',
          color: color || '#ffffff',
          padding: '1px 3px',
          borderRadius: '3px',
          border: `1px solid ${color || '#ffffff'}`,
          fontSize: '8px',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          boxShadow: `0 0 4px ${color || '#ffffff'}20`,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {isSpeaking && <span style={{ marginRight: '4px' }}>🎤</span>}
        {isPremium && <span style={{ marginRight: '4px' }}>⭐</span>}
        {username}
        {isCurrentUser && (
          <span 
            style={{ 
              marginLeft: '6px',
              fontSize: '10px',
              opacity: 0.8,
            }}
          >
            (YOU)
          </span>
        )}
      </div>
    </Html>
  );
}
