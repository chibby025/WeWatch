import React, { useEffect } from 'react';
import { HeartIcon } from '@heroicons/react/24/solid';

const TikTokHeartAnimation = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onComplete) onComplete();
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center">
      <div className="animate-tiktok-heart">
        <HeartIcon className="w-32 h-32 text-red-500 drop-shadow-2xl" />
      </div>
      <style>{`
        @keyframes tiktok-heart {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          15%  { transform: scale(1.3) rotate(-10deg); opacity: 1; }
          35%  { transform: scale(0.95) rotate(0deg); opacity: 1; }
          55%  { transform: scale(1.05) rotate(0deg); opacity: 1; }
          75%  { transform: scale(1.1) rotate(5deg); opacity: 0.8; }
          100% { transform: scale(1.4) rotate(10deg); opacity: 0; }
        }
        .animate-tiktok-heart {
          animation: tiktok-heart 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
      `}</style>
    </div>
  );
};

export default TikTokHeartAnimation;
