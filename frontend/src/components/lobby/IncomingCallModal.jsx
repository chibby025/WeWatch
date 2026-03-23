// frontend/src/components/lobby/IncomingCallModal.jsx
import React, { useEffect, useState } from 'react';

const IncomingCallModal = ({ 
  isOpen, 
  caller, 
  onAccept,
  onDecline
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    // Auto-decline after 60 seconds
    const timeout = setTimeout(() => {
      onDecline?.();
    }, 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isOpen, onDecline]);

  useEffect(() => {
    if (isOpen) {
      setElapsed(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center max-w-sm w-full animate-pulse">
        {/* Avatar with pulse animation */}
        <div className="relative">
          {caller?.avatar_url ? (
            <img 
              src={caller.avatar_url.startsWith('http') ? caller.avatar_url : `http://localhost:8080${caller.avatar_url}`}
              alt={caller.username}
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-green-500 shadow-2xl"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/icons/user1avatar.svg';
              }}
            />
          ) : (
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br from-green-600 to-blue-600 flex items-center justify-center text-white font-bold text-4xl sm:text-5xl border-4 border-green-500 shadow-2xl">
              {caller?.username?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          
          {/* Ripple effect */}
          <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-75"></div>
          <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-75" style={{ animationDelay: '0.5s' }}></div>
        </div>

        {/* Name */}
        <h2 className="text-white text-2xl sm:text-3xl font-bold mt-6 text-center">
          {caller?.username || 'User'}
        </h2>

        {/* Status */}
        <p className="text-green-400 text-lg sm:text-xl mt-2 text-center">
          Incoming call...
        </p>

        {/* Timer */}
        <p className="text-gray-500 text-sm mt-2">
          {elapsed}s / 60s
        </p>

        {/* Phone icon */}
        <div className="mt-8 mb-8">
          <div className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center animate-bounce">
            <span className="text-3xl">📞</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 w-full px-4">
          {/* Decline button */}
          <button
            onClick={onDecline}
            className="flex-1 px-6 py-4 rounded-full font-semibold text-white bg-red-600 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="hidden sm:inline">Decline</span>
          </button>

          {/* Accept button */}
          <button
            onClick={onAccept}
            className="flex-1 px-6 py-4 rounded-full font-semibold text-white bg-green-600 hover:bg-green-700 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden sm:inline">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
