// frontend/src/components/AppSplash.jsx
// Loading splash shown while VideoWatch, LectureHall, and Cinema initialise.
import React from 'react';

export default function AppSplash({ statusText = null }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <img
        src="/icons/LWO1.webp"
        alt="LetsWatchOut"
        className="w-28 h-28 sm:w-36 sm:h-36"
        style={{ animation: 'fadeScaleIn 0.4s ease-out forwards, logoPulse 1.5s ease-in-out 0.4s infinite' }}
      />
      {statusText && (
        <p className="mt-6 text-gray-400 text-sm font-medium tracking-wide">
          {statusText}
        </p>
      )}
    </div>
  );
}
