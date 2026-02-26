// src/components/cinema/3d-cinema/CinemaLoadingOverlay.jsx
import React from 'react';

/**
 * Enhanced loading overlay for 3D cinema with detailed status messages
 * Shows while waiting for seat assignment and scene initialization
 */
export default function CinemaLoadingOverlay({ status = 'connecting', loadingDetails = null }) {
  const statusMessages = {
    connecting: { text: 'Connecting to cinema...', icon: '🔗' },
    connecting_voice: { text: 'Connecting to voice chat...', icon: '🎤' },
    finding_seat: { text: 'Finding your seat...', icon: '🪑' },
    loading_scene: { text: 'Loading 3D theater...', icon: '🎬' },
  };
  
  const currentStatus = statusMessages[status] || statusMessages.connecting;
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      {/* Spinner */}
      <div className="w-16 h-16 border-4 border-gray-600 border-t-white rounded-full animate-spin mb-6"></div>
      
      {/* Status message */}
      <div className="text-white text-xl font-semibold mb-2">
        <span className="mr-2">{currentStatus.icon}</span>
        {currentStatus.text}
      </div>
      
      {/* Additional loading details */}
      {loadingDetails && (
        <div className="text-gray-400 text-sm mt-2">
          {loadingDetails}
        </div>
      )}
      
      {/* Progress hint */}
      <div className="text-gray-500 text-xs mt-4 max-w-md text-center">
        This may take a few seconds on first connection...
      </div>
    </div>
  );
}
