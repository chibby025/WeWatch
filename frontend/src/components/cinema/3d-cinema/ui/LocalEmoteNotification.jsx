// frontend/src/components/cinema/3d-cinema/ui/LocalEmoteNotification.jsx
import React, { useEffect, useState } from 'react';
import EmojiImage from '../../../cinema/ui/EmojiImage';

/**
 * LocalEmoteNotification - Shows floating emoji in user's own viewport
 * This is a 2D overlay effect that appears when the user sends an emote
 */
export default function LocalEmoteNotification({ emote, onComplete }) {
  const [isVisible, setIsVisible] = useState(true);

  const emojiMap = {
    wave: '👋',
    clap: '👏',
    thumbs_up: '👍',
    laugh: '😂',
    heart: '❤️',
  };

  const emoji = emojiMap[emote] || '✨';

  useEffect(() => {
    // console.log('🎬 [LocalEmoteNotification] Mounted with emote:', emote, 'emoji:', emoji);
    
    // Auto-remove after animation completes
    const timer = setTimeout(() => {
      // console.log('⏰ [LocalEmoteNotification] Timer complete, removing');
      setIsVisible(false);
      if (onComplete) onComplete();
    }, 2500); // 2.5 seconds total

    return () => {
      // console.log('🧹 [LocalEmoteNotification] Cleanup');
      clearTimeout(timer);
    };
  }, [onComplete, emote, emoji]);

  if (!isVisible) {
    // console.log('👻 [LocalEmoteNotification] Not visible, returning null');
    return null;
  }

  // console.log('✅ [LocalEmoteNotification] Rendering emote:', emote, 'emoji:', emoji);

  return (
    <div className="local-emote-notification">
      <div className="emoji">
        <EmojiImage emoji={emoji} size={96} />
      </div>
      <style jsx>{`
        .local-emote-notification {
          position: fixed;
          bottom: 120px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          pointer-events: none;
          animation: floatUp 2.5s ease-out forwards;
        }

        .emoji {
          filter: drop-shadow(0 0 20px rgba(0, 0, 0, 0.8))
                  drop-shadow(0 0 40px rgba(0, 0, 0, 0.6));
          animation: scaleAndFade 2.5s ease-out forwards;
        }

        @keyframes floatUp {
          0% {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateX(-50%) translateY(-200px);
            opacity: 0;
          }
        }

        @keyframes scaleAndFade {
          0% {
            transform: scale(0.5);
            opacity: 0;
          }
          10% {
            transform: scale(1.2);
            opacity: 1;
          }
          20% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(0.8);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
