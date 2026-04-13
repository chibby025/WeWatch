// TikTok-style heart animation component
// Displays a heart that scales up and fades out in the center of the screen
import React, { useEffect, useState } from 'react';
import { HeartIcon } from '@heroicons/react/24/solid';

const TikTokHeartAnimation = ({ show, onAnimationEnd }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      
      // Hide after animation completes (800ms)
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onAnimationEnd) {
          onAnimationEnd();
        }
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [show, onAnimationEnd]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center">
      <div className="animate-tiktok-heart">
        <HeartIcon className="w-32 h-32 text-red-500 drop-shadow-2xl" />
      </div>
      
      {/* Add CSS animation */}
      <style jsx>{`
        @keyframes tiktok-heart {
          0% {
            transform: scale(0) rotate(-15deg);
            opacity: 0;
          }
          15% {
            transform: scale(1.2) rotate(-10deg);
            opacity: 1;
          }
          30% {
            transform: scale(0.95) rotate(0deg);
            opacity: 1;
          }
          50% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
          70% {
            transform: scale(1.1) rotate(5deg);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.3) rotate(10deg);
            opacity: 0;
          }
        }
        
        .animate-tiktok-heart {
          animation: tiktok-heart 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
      `}</style>
    </div>
  );
};

export default TikTokHeartAnimation;
