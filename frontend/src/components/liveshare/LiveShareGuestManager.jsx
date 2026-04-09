// frontend/src/components/liveshare/LiveShareGuestManager.jsx
import { useState } from 'react';

export default function LiveShareGuestManager({
  watchSessionMembers = [],
  currentUserId,
  activeGuest,
  mode,
  onGrantPermission,
  onRevokePermission,
  onKickGuest,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Solo modes don't support guests
  const soloModes = ['news'];
  const isSoloMode = soloModes.includes(mode);

  // Filter out current user (host) from member list
  const availableMembers = watchSessionMembers.filter(m => m.user_id !== currentUserId);

  // Check if at capacity (max 1 guest)
  const isAtCapacity = activeGuest && (activeGuest.status === 'granted' || activeGuest.status === 'active');
  const guestCount = isAtCapacity ? 1 : 0;
  const maxGuests = 1;

  if (isSoloMode) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mt-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">ℹ️</div>
          <div>
            <p className="text-blue-400 text-sm font-medium mb-1">Solo Mode</p>
            <p className="text-gray-300 text-xs">
              This mode is designed for solo broadcasting. No guest collaboration available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#D9D9D9]/20 rounded-xl p-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">👥</div>
          <div>
            <h3 className="text-white font-medium text-sm">Guest Management</h3>
            <p className="text-gray-400 text-xs">
              {guestCount}/{maxGuests} guest{maxGuests > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {isAtCapacity && (
          <div className="px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-400 text-xs">
            At Capacity
          </div>
        )}
      </div>

      {/* Active/Pending Guest */}
      {activeGuest && (
        <div className="bg-gray-800 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                {activeGuest.username?.charAt(0).toUpperCase()}
              </div>
              
              {/* Guest Info */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{activeGuest.username}</span>
                  {activeGuest.status === 'active' && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                      Live
                    </span>
                  )}
                  {activeGuest.status === 'granted' && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-blue-400 text-xs flex items-center gap-1">
                      🕐 Pending
                    </span>
                  )}
                </div>
                {activeGuest.shareType && (
                  <span className="text-gray-400 text-xs">
                    {activeGuest.shareType === 'camera' && '📹 Camera'}
                    {activeGuest.shareType === 'screen' && '🖥️ Screen'}
                    {activeGuest.shareType === 'both' && '🎬 Screen + Camera'}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {activeGuest.status === 'granted' && (
                <button
                  onClick={() => onRevokePermission(activeGuest.userId)}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-400 text-xs transition-colors"
                  title="Revoke permission"
                >
                  Revoke
                </button>
              )}
              {activeGuest.status === 'active' && (
                <button
                  onClick={() => onKickGuest(activeGuest.userId)}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-400 text-xs transition-colors"
                  title="Remove guest"
                >
                  Kick
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Member List */}
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 hover:bg-gray-750 rounded-lg transition-colors text-left"
        >
          <span className="text-gray-300 text-sm">
            {isExpanded ? 'Hide' : 'Show'} Members ({availableMembers.length})
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
            {availableMembers.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                No other members in session
              </div>
            ) : (
              availableMembers.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-white text-xs font-bold">
                      {member.username?.charAt(0).toUpperCase()}
                    </div>
                    
                    {/* Member Info */}
                    <div>
                      <span className="text-white text-sm">{member.username}</span>
                      {member.role && (
                        <span className="ml-2 px-1.5 py-0.5 bg-gray-700 rounded text-gray-400 text-xs">
                          {member.role}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Grant Button */}
                  <button
                    onClick={() => onGrantPermission(member.user_id, member.username)}
                    disabled={isAtCapacity}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      isAtCapacity
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                    title={isAtCapacity ? 'At capacity' : 'Grant LiveShare permission'}
                  >
                    Grant
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="mt-3 px-3 py-2 bg-gray-800/50 rounded-lg">
        <p className="text-gray-400 text-xs leading-relaxed">
          <span className="font-medium">Tip:</span> Grant permission to invite a member to join live. 
          They can share camera/screen. Revoke before they join, or kick to remove active guests.
        </p>
      </div>
    </div>
  );
}
