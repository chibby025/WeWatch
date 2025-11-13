import React from 'react';
import { Html } from '@react-three/drei';

/**
 * UsernameLabel - Floating username above avatar
 * Features:
 * - Billboard effect (always faces camera)
 * - Styled with user's avatar color
 * - Premium indicator (⭐)
 * - Current user indicator (YOU)
 */
export default function UsernameLabel({
  username,
  color,
  position = [0, 1.4, 0],
  isPremium = false,
  isCurrentUser = false,
}) {
  return (
    <Html
      position={position}
      center
      distanceFactor={6} // Size scaling with distance
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.7)',
          color: color || '#ffffff',
          padding: '4px 8px',
          borderRadius: '8px',
          border: `1px solid ${color || '#ffffff'}`,
          fontSize: '12px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          boxShadow: `0 0 10px ${color || '#ffffff'}40`, // Subtle glow
          fontFamily: 'Arial, sans-serif',
        }}
      >
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
