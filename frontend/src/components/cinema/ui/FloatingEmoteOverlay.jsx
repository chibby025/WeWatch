import React, { useEffect, useState } from 'react';
import EmojiImage from './EmojiImage';

/**
 * FloatingEmoteOverlay - 2D floating emoji animation (VideoWatch mode)
 * Visible to all users in the room when someone sends an emote
 */
const HEART_EMOJI = '❤️';

export default function FloatingEmoteOverlay({ emoji, onComplete }) {
  const [opacity, setOpacity] = useState(1);
  const [translateY, setTranslateY] = useState(0);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (progress >= 1) {
        if (onComplete) onComplete();
        return;
      }

      // Float upward
      setTranslateY(-progress * 100);

      // Fade out (start fading at 50% progress)
      const fadeProgress = Math.max(0, (progress - 0.5) * 2);
      setOpacity(1 - fadeProgress);

      // Scale animation (grow then shrink)
      const currentScale = progress < 0.2 
        ? 0.5 + (progress / 0.2) * 0.7  // 0.5 -> 1.2
        : progress < 0.4
        ? 1.2 - ((progress - 0.2) / 0.2) * 0.2  // 1.2 -> 1.0
        : 1.0 - ((progress - 0.4) / 0.6) * 0.2; // 1.0 -> 0.8
      setScale(currentScale);

      requestAnimationFrame(animate);
    };

    const animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [onComplete]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, calc(-50% + ${translateY}px)) scale(${scale})`,
        opacity: opacity,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.9))',
        transition: 'transform 0.05s ease-out, opacity 0.05s ease-out',
        zIndex: 1000,
      }}
    >
      <EmojiImage emoji={emoji} size={emoji === HEART_EMOJI ? 82 : 64} />
    </div>
  );
}
