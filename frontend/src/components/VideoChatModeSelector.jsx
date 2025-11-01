// frontend/src/components/VideoChatModeSelector.jsx
import React, { useState } from 'react';

/**
 * VideoChatModeSelector Component
 * The FIRST modal users see when clicking "Begin Watch."
 * Presents two paths:
 * 1. ✅ "Quick Watch (Video Chat)" → Google Meet-style grid → baseline human connection.
 * 2. 🎬 "Immersive Experience" → Opens your existing BeginWatchModal → Cinema, Stadium, Rave, etc.
 * 
 * Props:
 * - onClose: Function to close this modal.
 * - onQuickWatch: Function to start Video Chat Mode.
 * - onImmersiveExperience: Function to open the theme selector (BeginWatchModal).
 */
const VideoChatModeSelector = ({
  onClose,
  onQuickWatch,
  onImmersiveExperience
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Choose Your Experience</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* OPTION 1: QUICK WATCH (VIDEO CHAT) */}
          <div 
            className="p-6 border-2 border-blue-500 rounded-lg cursor-pointer hover:shadow-lg transition-all duration-200 transform hover:scale-105 bg-blue-50"
            onClick={onQuickWatch}
          >
            <div className="flex items-center mb-3">
              <div className="text-3xl mr-3">🎥</div>
              <h3 className="text-xl font-bold text-blue-800">Quick Watch (Video Chat)</h3>
            </div>
            <p className="text-gray-700">
              See and hear everyone in a simple video grid. Perfect for quick hangouts or casual viewing.
            </p>
            <div className="mt-3 flex items-center text-sm text-blue-600">
              <span className="font-medium">Baseline Experience</span>
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">FREE</span>
            </div>
          </div>

          {/* OPTION 2: IMMERSIVE EXPERIENCE */}
          <div 
            className="p-6 border-2 border-purple-500 rounded-lg cursor-pointer hover:shadow-lg transition-all duration-200 transform hover:scale-105 bg-purple-50"
            onClick={onImmersiveExperience}
          >
            <div className="flex items-center mb-3">
              <div className="text-3xl mr-3">🎬</div>
              <h3 className="text-xl font-bold text-purple-800">Immersive Experience</h3>
            </div>
            <p className="text-gray-700">
              Choose a themed world: Cinema, Stadium, Rave, or Church. Sit in seats, hear only neighbors, and feel truly together.
            </p>
            <div className="mt-3 flex items-center text-sm text-purple-600">
              <span className="font-medium">Elevated Experience</span>
              <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">UPGRADE</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>You can switch modes anytime during your watch party.</p>
        </div>
      </div>
    </div>
  );
};

export default VideoChatModeSelector;