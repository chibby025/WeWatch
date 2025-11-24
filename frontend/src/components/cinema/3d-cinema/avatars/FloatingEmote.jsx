// frontend/src/components/cinema/3d-cinema/avatars/FloatingEmote.jsx
import React from 'react';
import { Html } from '@react-three/drei';

export default function FloatingEmote({ emote, position = [0, 0, 0] }) {
  if (!emote) return null;

  const emojiMap = {
    wave: '👋',
    clap: '👏',
    thumbs_up: '👍',
    laugh: '😂',
    heart: '❤️',
  };

  const emoji = emojiMap[emote] || '✨';
  const [x, y, z] = position;

  return (
    <Html
      position={[x, y + 0.5, z]}
      center
      distanceFactor={5}
      style={{
        fontSize: '1.5em',
        fontWeight: 'bold',
        textShadow: '0 0 8px rgba(0,0,0,0.8)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {emoji}
    </Html>
  );
}