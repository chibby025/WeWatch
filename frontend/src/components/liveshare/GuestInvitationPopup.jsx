// frontend/src/components/liveshare/GuestInvitationPopup.jsx
// Simplified guest invitation - One-click join with share type selector

import { useState } from 'react';
import { Camera, Monitor, X } from 'lucide-react';

export default function GuestInvitationPopup({
  invitation,
  onAccept,
  onDecline,
}) {
  const [selectedShareType, setSelectedShareType] = useState('camera'); // Pre-select camera
  const [isJoining, setIsJoining] = useState(false);

  const shareTypes = [
    { id: 'camera', label: 'Camera', icon: Camera, description: 'Share your webcam' },
    { id: 'screen', label: 'Screen', icon: Monitor, description: 'Share your screen' },
  ];

  const handleJoin = async () => {
    setIsJoining(true);
    await onAccept(selectedShareType);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-md w-full border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              🎙️ You're Invited!
            </h2>
            <p className="text-sm text-gray-400 mt-1">Join as co-host</p>
          </div>
          <button
            onClick={onDecline}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            disabled={isJoining}
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Show Info */}
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Host</span>
              <span className="text-white font-medium">@{invitation.hostUsername}</span>
            </div>
            {invitation.showTitle && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Show</span>
                <span className="text-white font-medium">"{invitation.showTitle}"</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Mode</span>
              <span className="text-white font-medium capitalize">{invitation.mode}</span>
            </div>
          </div>

          {/* Share Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Choose how to join:
            </label>
            <div className="grid grid-cols-2 gap-3">
              {shareTypes.map((type) => {
                const IconComponent = type.icon;
                const isSelected = selectedShareType === type.id;
                
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedShareType(type.id)}
                    disabled={isJoining}
                    className={`
                      relative p-4 rounded-lg border-2 transition-all text-left
                      ${isSelected 
                        ? 'border-purple-500 bg-purple-500/10' 
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                      }
                      ${isJoining ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {/* Radio indicator */}
                    <div className={`
                      absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center
                      ${isSelected ? 'border-purple-500' : 'border-gray-600'}
                    `}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      )}
                    </div>

                    {/* Icon */}
                    <div className={`
                      w-10 h-10 rounded-lg flex items-center justify-center mb-3
                      ${isSelected ? 'bg-purple-500/20' : 'bg-gray-700'}
                    `}>
                      <IconComponent className={`w-5 h-5 ${isSelected ? 'text-purple-400' : 'text-gray-400'}`} />
                    </div>

                    {/* Label */}
                    <div>
                      <h3 className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                        {type.label}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 You can switch to the other type after joining
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex gap-3">
          <button
            onClick={onDecline}
            disabled={isJoining}
            className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Decline
          </button>
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isJoining ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Joining...
              </>
            ) : (
              <>
                Accept & Go Live 🎥
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
