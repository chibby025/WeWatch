// src/components/cinema/3d-cinema/RotateDevicePrompt.jsx
import React from 'react';

/**
 * RotateDevicePrompt - Overlay shown when mobile device is in portrait mode
 * Prompts user to rotate to landscape for better cinema experience
 */
export default function RotateDevicePrompt() {
  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center p-6 text-white">
      {/* Animated phone rotation icon */}
      <div className="mb-8 relative">
        <div className="animate-bounce">
          <svg 
            width="120" 
            height="120" 
            viewBox="0 0 120 120" 
            fill="none" 
            className="transform rotate-90"
          >
            {/* Phone outline */}
            <rect 
              x="30" 
              y="20" 
              width="60" 
              height="80" 
              rx="8" 
              stroke="currentColor" 
              strokeWidth="3" 
              fill="none"
            />
            {/* Screen */}
            <rect 
              x="38" 
              y="28" 
              width="44" 
              height="64" 
              rx="4" 
              fill="currentColor" 
              opacity="0.3"
            />
            {/* Home button */}
            <circle 
              cx="60" 
              cy="92" 
              r="4" 
              fill="currentColor"
            />
          </svg>
        </div>
        
        {/* Rotation arrow */}
        <div className="absolute -right-8 top-1/2 transform -translate-y-1/2 animate-pulse">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <path 
              d="M30 10 Q40 10 45 15 Q50 20 50 30" 
              stroke="currentColor" 
              strokeWidth="3" 
              fill="none"
              strokeLinecap="round"
            />
            <path 
              d="M50 30 L45 25 M50 30 L55 25" 
              stroke="currentColor" 
              strokeWidth="3" 
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Text instruction */}
      <h2 className="text-2xl font-bold mb-3 text-center">
        Rotate Your Device
      </h2>
      <p className="text-gray-400 text-center max-w-sm mb-2">
        For the best cinema experience, please rotate your device to landscape mode
      </p>
      <p className="text-gray-500 text-sm text-center">
        🎬 Wider view = Better immersion
      </p>
    </div>
  );
}
