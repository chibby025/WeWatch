// frontend/src/components/lobby/OutgoingCallModal.jsx
import React, { useEffect, useState } from 'react';

const OutgoingCallModal = ({ 
  isOpen, 
  friend, 
  onCancel,
  callStatus = 'calling' // 'calling', 'declined', 'busy', 'no_answer'
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isOpen || callStatus !== 'calling') return;

    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, callStatus]);

  useEffect(() => {
    if (isOpen) {
      setElapsed(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getStatusText = () => {
    switch (callStatus) {
      case 'calling':
        return 'Calling...';
      case 'declined':
        return 'Call declined';
      case 'busy':
        return 'User is busy';
      case 'no_answer':
        return 'No answer';
      default:
        return 'Calling...';
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case 'calling':
        return 'text-gray-400';
      case 'declined':
        return 'text-red-400';
      case 'busy':
        return 'text-yellow-400';
      case 'no_answer':
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center max-w-sm w-full">
        {/* Avatar with pulse animation for calling state */}
        <div className={`relative ${callStatus === 'calling' ? 'animate-pulse' : ''}`}>
          {friend?.avatar_url ? (
            <img 
              src={friend.avatar_url.startsWith('http') ? friend.avatar_url : `http://localhost:8080${friend.avatar_url}`}
              alt={friend.username}
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-blue-500 shadow-2xl"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/icons/user1avatar.svg';
              }}
            />
          ) : (
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-4xl sm:text-5xl border-4 border-blue-500 shadow-2xl">
              {friend?.username?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          
          {/* Ripple effect for calling */}
          {callStatus === 'calling' && (
            <>
              <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75" style={{ animationDelay: '0.5s' }}></div>
            </>
          )}
        </div>

        {/* Name */}
        <h2 className="text-white text-2xl sm:text-3xl font-bold mt-6 text-center">
          {friend?.username || 'User'}
        </h2>

        {/* Status */}
        <p className={`${getStatusColor()} text-lg sm:text-xl mt-2 text-center`}>
          {getStatusText()}
        </p>

        {/* Timer for calling state */}
        {callStatus === 'calling' && (
          <p className="text-gray-500 text-sm mt-2">
            {elapsed}s
          </p>
        )}

        {/* Phone icon */}
        <div className="mt-8 mb-8">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            callStatus === 'calling' ? 'bg-blue-600' : 'bg-gray-700'
          }`}>
            <span className="text-3xl">📞</span>
          </div>
        </div>

        {/* Cancel/Close button */}
        <button
          onClick={onCancel}
          className={`px-8 py-3 rounded-full font-semibold text-white transition-all ${
            callStatus === 'calling' 
              ? 'bg-red-600 hover:bg-red-700' 
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {callStatus === 'calling' ? 'Cancel' : 'Close'}
        </button>
      </div>
    </div>
  );
};

export default OutgoingCallModal;
