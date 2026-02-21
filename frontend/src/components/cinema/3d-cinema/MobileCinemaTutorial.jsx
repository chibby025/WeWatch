// src/components/cinema/3d-cinema/MobileCinemaTutorial.jsx
import React, { useState, useEffect } from 'react';

/**
 * MobileCinemaTutorial - One-time tutorial overlay for mobile users
 * Shows touch control instructions on first cinema visit
 */
export default function MobileCinemaTutorial({ onComplete }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has seen tutorial before
    const hasSeenTutorial = localStorage.getItem('cinema_mobile_tutorial_seen');
    
    if (!hasSeenTutorial) {
      // Show tutorial after 1 second delay (let scene load first)
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    } else {
      // Already seen, skip
      onComplete();
    }
  }, [onComplete]);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem('cinema_mobile_tutorial_seen', 'true');
    onComplete();
  };

  const handleGotIt = () => {
    handleClose();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <div className="text-center mb-3">
          <div className="text-3xl mb-2">🎬</div>
          <h2 className="text-xl font-bold text-white mb-1">Welcome to 3D Cinema!</h2>
          <p className="text-gray-400 text-xs">Quick tour of mobile controls</p>
        </div>

        {/* Instructions - Horizontal layout for landscape */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Look around */}
          <div className="flex flex-col items-center text-center bg-gray-800/50 p-2 rounded-lg">
            <div className="text-2xl mb-1">👆</div>
            <div className="text-white font-medium text-sm mb-0.5">Look Around</div>
            <div className="text-gray-400 text-xs">
              Tap edges to turn
            </div>
          </div>

          {/* Taskbar */}
          <div className="flex flex-col items-center text-center bg-gray-800/50 p-2 rounded-lg">
            <div className="text-2xl mb-1">⬇️</div>
            <div className="text-white font-medium text-sm mb-0.5">Show Controls</div>
            <div className="text-gray-400 text-xs">
              Tap bottom for taskbar
            </div>
          </div>

          {/* Landscape */}
          <div className="flex flex-col items-center text-center bg-gray-800/50 p-2 rounded-lg">
            <div className="text-2xl mb-1">📱</div>
            <div className="text-white font-medium text-sm mb-0.5">Best View</div>
            <div className="text-gray-400 text-xs">
              Use landscape mode
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <button
          onClick={handleGotIt}
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold text-sm rounded-lg transition-all duration-200"
        >
          Got it! 🎉
        </button>
      </div>
    </div>
  );
}
