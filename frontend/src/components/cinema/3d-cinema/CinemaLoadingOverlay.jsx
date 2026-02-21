// src/components/cinema/3d-cinema/CinemaLoadingOverlay.jsx
import React from 'react';

/**
 * Simple loading overlay for 3D cinema - black screen with spinner
 * Shows while waiting for seat assignment and scene initialization
 */
export default function CinemaLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* Simple spinner */}
      <div className="w-16 h-16 border-4 border-gray-600 border-t-white rounded-full animate-spin"></div>
    </div>
  );
}
