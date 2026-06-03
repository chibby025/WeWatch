// frontend/src/components/AppSplash.jsx
// Loading splash shown while VideoWatch, LectureHall, and Cinema initialise.
import React from 'react';

export default function AppSplash({ statusText = null }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <img
        src="/icons/lwoIcon.webp"
        alt="LetsWatchOut"
        className="w-36 h-36 sm:w-44 sm:h-44 object-contain"
        style={{ animation: 'fadeScaleIn 0.4s ease-out forwards, logoPulse 1.5s ease-in-out 0.4s infinite' }}
      />
      {statusText && (
        <p className="mt-6 text-gray-500 text-sm font-medium tracking-wide">
          {statusText}
        </p>
      )}
    </div>
  );
}
