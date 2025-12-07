// frontend/src/components/cinema/3d-cinema/avatars/FloatingEmote.jsx
import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import EmojiImage from '../../../cinema/ui/EmojiImage';

/**
 * FloatingEmote - 3D floating emoji that rises above avatar head
 * Visible to other users in the room
 */
export default function FloatingEmote({ emote, position = [0, 0, 0], onComplete }) {
  if (!emote) return null;

  const groupRef = useRef();
  const startTimeRef = useRef(Date.now());
  const [opacity, setOpacity] = useState(1);
  const duration = 2500; // 2.5 seconds

  const emojiMap = {
    wave: '👋',
    clap: '👏',
    thumbs_up: '👍',
    laugh: '😂',
    heart: '❤️',
  };

  const emoji = emojiMap[emote] || '✨';
  const [baseX, baseY, baseZ] = position;

  // Animate upward float with fade
  useFrame(() => {
    if (!groupRef.current) return;

    const elapsed = Date.now() - startTimeRef.current;
    const progress = Math.min(elapsed / duration, 1);

    if (progress >= 1) {
      if (onComplete) onComplete();
      return;
    }

    // Float upward (2 units over 2.5 seconds)
    const floatAmount = progress * 2;
    groupRef.current.position.y = baseY + 0.8 + floatAmount;

    // Fade out (start fading at 50% progress)
    const fadeProgress = Math.max(0, (progress - 0.5) * 2);
    setOpacity(1 - fadeProgress);

    // Slight scale animation (grow then shrink)
    const scale = progress < 0.2 
      ? 0.5 + (progress / 0.2) * 0.7  // 0.5 -> 1.2
      : progress < 0.4
      ? 1.2 - ((progress - 0.2) / 0.2) * 0.2  // 1.2 -> 1.0
      : 1.0 - ((progress - 0.4) / 0.6) * 0.2; // 1.0 -> 0.8
    
    groupRef.current.scale.set(scale, scale, scale);
  });

  return (
    <group ref={groupRef} position={[baseX, baseY + 0.8, baseZ]}>
      <Html
        center
        distanceFactor={5}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: opacity,
          transition: 'opacity 0.1s ease-out',
          filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.9)) drop-shadow(0 0 20px rgba(0,0,0,0.6))',
        }}
      >
        <EmojiImage emoji={emoji} size={48} />
      </Html>
    </group>
  );
}