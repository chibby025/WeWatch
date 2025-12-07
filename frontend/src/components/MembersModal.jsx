// frontend/src/components/MembersModal.jsx
import React from 'react';

export default function MembersModal({ 
  isOpen, 
  onClose, 
  members = [],
  fetchMembers = null,
  onMemberClick, // ✅ NEW prop
  isHost = false, // Whether current user is host
  currentUserId = null, // Current user's ID
  audioStates = {}, // Map of userId -> boolean (true = speaking, false = muted)
  broadcastPermissions = {}, // Map of userId -> boolean (true = can broadcast to whole room)
  onToggleBroadcast = null, // Callback to grant/revoke broadcast permission
  userSeats = {}, // Map of userId -> seatId
  sessionId = null, // Current session ID
  userTheaters = {}, // Map of userId -> {theater_number, seat_row, seat_col}
  onRequestBroadcast = null, // Callback for user to request broadcast permission
  broadcastRequests = [], // Array of pending broadcast request user IDs
  watchType = 'video_watch', // Session watch type ('video_watch' or '3d_cinema')
}) {
  React.useEffect(() => {
    if (isOpen && fetchMembers) {
      fetchMembers();
    }
  }, [isOpen, fetchMembers]);

  // Color function for theater badges
  const getTheaterBadgeColor = (theaterNumber) => {
    const colors = [
      'bg-blue-500', // T1
      'bg-green-500', // T2
      'bg-purple-500', // T3
      'bg-orange-500', // T4
      'bg-pink-500', // T5
      'bg-teal-500', // T6
    ];
    return colors[(theaterNumber - 1) % colors.length];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white text-lg font-bold">
            Room Members ({members.length})
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {members.map(member => {
            const isAudioActive = audioStates[member.id] || false;
            const canBroadcast = broadcastPermissions[member.id] || false;
            const isRoomHost = member.user_role === 'host' || member.is_host;
            const memberSeatId = userSeats[member.id];
            const rowNumber = memberSeatId ? memberSeatId.split('-')[0] : '?';
            const theaterInfo = userTheaters[member.id];
            const hasBroadcastRequest = broadcastRequests.includes(member.id);
            
            return (
              <div 
                key={member.id} 
                className="bg-gray-700/50 p-3 rounded hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  {/* Left: Avatar + Name + Audio State */}
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => onMemberClick?.(member)}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                      {member.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    
                    {/* Name + Status */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">
                          {member.username || `User ${member.id}`}
                        </span>
                        {isRoomHost && (
                          <span className="bg-yellow-500 text-black text-xs px-2 py-0.5 rounded-full font-bold">
                            Host
                          </span>
                        )}
                        {hasBroadcastRequest && (
                          <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                            🎤 Request
                          </span>
                        )}
                      </div>
                      
                      {/* Theater Assignment (3D Cinema only) */}
                      {watchType === '3d_cinema' && theaterInfo && (
                        <div className="flex items-center gap-1 mt-1">
                          <span 
                            className={`text-white text-xs px-1.5 py-0.5 rounded font-semibold ${getTheaterBadgeColor(theaterInfo.theater_number)}`}
                            title={`Theater ${theaterInfo.theater_number}`}
                          >
                            T{theaterInfo.theater_number}
                          </span>
                          <span className="text-gray-400 text-xs">
                            Row {theaterInfo.seat_row}, Seat {theaterInfo.seat_col}
                          </span>
                        </div>
                      )}
                      
                      {/* Audio State */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs ${isAudioActive ? 'text-green-400' : 'text-gray-400'}`}>
                          {isAudioActive ? '🎤 Speaking' : '🔇 Muted'}
                        </span>
                        
                        {/* Broadcast State */}
                        {isAudioActive && (
                          <span className="text-xs text-gray-300">
                            •
                          </span>
                        )}
                        {isAudioActive && (canBroadcast || isRoomHost) && (
                          <span className="text-xs text-blue-400 font-medium">
                            🔊 Whole Room
                          </span>
                        )}
                        {isAudioActive && !canBroadcast && !isRoomHost && watchType === '3d_cinema' && theaterInfo && (
                          <span className="text-xs text-gray-400">
                            🔈 Theater {theaterInfo.theater_number}
                          </span>
                        )}
                        {isAudioActive && !canBroadcast && !isRoomHost && watchType === 'video_watch' && (
                          <span className="text-xs text-gray-400">
                            🔈 Row {rowNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: Broadcast Toggle (Host Only) or Request Button (Non-Host) */}
                  <div className="flex items-center gap-2">
                    {/* Request Broadcast Button (Non-Host, for own row) */}
                    {!isHost && member.id === currentUserId && !canBroadcast && !isRoomHost && onRequestBroadcast && (
                      <button
                        onClick={() => onRequestBroadcast()}
                        className="ml-3 px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-all"
                        title="Request whole-room broadcast permission"
                      >
                        🎤 Request Broadcast
                      </button>
                    )}
                    
                    {/* Broadcast Toggle (Host Only) */}
                    {isHost && !isRoomHost && member.id !== currentUserId && sessionId && (
                      <button
                        onClick={() => onToggleBroadcast?.(member.id, !canBroadcast)}
                        className={`ml-3 p-2 rounded transition-all ${
                          canBroadcast 
                            ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                            : hasBroadcastRequest
                            ? 'bg-orange-500 hover:bg-orange-600 text-white animate-pulse'
                            : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                        }`}
                        title={
                          canBroadcast 
                            ? 'Revoke whole-room broadcast' 
                            : hasBroadcastRequest
                            ? 'Grant broadcast request'
                            : 'Grant whole-room broadcast'
                        }
                      >
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className="h-5 w-5" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828 2.828m-5.656 5.656a5 5 0 007.072 0" 
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}