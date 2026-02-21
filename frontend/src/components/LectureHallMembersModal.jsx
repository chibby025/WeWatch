// frontend/src/components/LectureHallMembersModal.jsx
import React from 'react';

export default function LectureHallMembersModal({ 
  isOpen, 
  onClose, 
  members = [],
  isHost = false,
  currentUserId = null,
  audioStates = {}, // userId -> boolean (speaking)
  raisedHands = [], // [{userId, username, seatId}]
  approvedSpeakers = {}, // userId -> true
  onApproveSpeaker = null,
  onRevokeSpeaker = null,
  onMuteUser = null, // Individual mute
  onMuteAll = null, // Mute all students
  userSeats = {}, // userId -> seatId
  onMemberClick = null, // Open private chat
  discussionMode = false, // Audio mode: false = row-based, true = discussion mode
}) {
  console.log('👥 [LectureHallMembersModal] Rendered with:', { members, isHost, userSeats, membersCount: members.length });
  
  // Debug avatar URLs
  if (members && members.length > 0) {
    members.forEach((m, i) => {
      console.log(`🖼️ [LectureHallMembersModal] Member ${i} (${m.username || m.id}):`, {
        avatar_url: m.avatar_url,
        hasAvatar: !!m.avatar_url,
        allKeys: Object.keys(m),
        fullMemberObject: m
      });
    });
  }

  if (!isOpen) return null;

  // Separate host and students
  const hostMember = members.find(m => m.user_role === 'host' || m.is_host);
  const students = members.filter(m => m.user_role !== 'host' && !m.is_host);

  // Sort students by seat number
  const sortedStudents = [...students].sort((a, b) => {
    const seatA = userSeats[a.id] || 999;
    const seatB = userSeats[b.id] || 999;
    return seatA - seatB;
  });

  // Helper: Check if user has raised hand
  const hasRaisedHand = (userId) => raisedHands.some(h => h.userId === userId);

  // Helper: Check if user is broadcasting
  const isBroadcasting = (userId) => approvedSpeakers[userId];

  // Handle raised hand click (for host only)
  const handleRaisedHandClick = (userId) => {
    if (!isHost) return;
    onApproveSpeaker?.(userId);
  };

  // Handle broadcast emoji click (for host only)
  const handleBroadcastClick = (userId) => {
    if (!isHost) return;
    onRevokeSpeaker?.(userId);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white text-xl font-bold">
            Lecture Hall Participants ({members.length})
          </h3>
          <div className="flex items-center gap-3">
            {isHost && onMuteAll && (
              <button
                onClick={onMuteAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-all"
                title="Mute all students"
              >
                🔇 Mute All Students
              </button>
            )}
            <button 
              onClick={onClose} 
              className="text-gray-400 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Audio Mode Indicator */}
        <div className="mb-6 bg-gray-700/30 p-3 rounded-lg">
          <div className="text-gray-300 text-sm">
            <span className="font-medium">Current audio mode:</span>{' '}
            <span className="text-white font-semibold">
              {discussionMode ? '📢 Discussion Mode' : '💬 Row-based'}
            </span>
          </div>
        </div>

        {/* Members List */}
        <div className="space-y-2">
          {/* Host Member (if exists) */}
          {hostMember && (
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <img 
                    src={hostMember.avatar_url || '/icons/user1avatar.svg'}
                    alt={hostMember.username}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/icons/user1avatar.svg';
                    }}
                    className="w-12 h-12 rounded-full object-cover border-2 border-yellow-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-base">
                        {hostMember.username || 'Host'}
                      </span>
                      <span className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full font-bold">
                        👨‍🏫 Teacher
                      </span>
                    </div>
                    <div className="text-yellow-200 text-xs mt-1">
                      Seat #{userSeats[hostMember.id] || 1}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Student Members */}
          {sortedStudents.length === 0 ? (
            <p className="text-gray-400 text-sm italic text-center py-8">
              No students in session
            </p>
          ) : (
            sortedStudents.map(member => {
              const seatId = userSeats[member.id];
              const hasRaised = hasRaisedHand(member.id);
              const isBroad = isBroadcasting(member.id);
              const isAudioActive = audioStates[member.id] || false;

              return (
                <div 
                  key={member.id}
                  className="bg-gray-700/50 hover:bg-gray-700/70 rounded-lg p-3 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <img 
                        src={member.avatar_url || '/icons/user1avatar.svg'}
                        alt={member.username}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '/icons/user1avatar.svg';
                        }}
                        className="w-10 h-10 rounded-full object-cover border-2 border-gray-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium text-sm">
                            {member.username || `User ${member.id}`}
                          </span>
                          
                          {/* Raised Hand Emoji (clickable for host) */}
                          {hasRaised && (
                            <span 
                              className={`text-lg ${isHost ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
                              title={isHost ? 'Click to approve broadcast' : 'Hand raised'}
                              onClick={() => handleRaisedHandClick(member.id)}
                            >
                              🙋
                            </span>
                          )}
                          
                          {/* Broadcasting Emoji (clickable for host to revoke) */}
                          {isBroad && (
                            <span 
                              className={`text-lg ${isHost ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
                              title={isHost ? 'Click to revoke broadcast' : 'Broadcasting to everyone'}
                              onClick={() => handleBroadcastClick(member.id)}
                            >
                              📢
                            </span>
                          )}
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          Seat #{seatId}
                          {isAudioActive && (
                            <>
                              {' • '}
                              <span className="text-green-400">
                                🎤 {isBroad ? 'Broadcasting' : 'Row Talk'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Private Message Button */}
                    {member.id !== currentUserId && (
                      <button
                        onClick={() => onMemberClick?.(member)}
                        className="p-2 rounded bg-gray-600 hover:bg-gray-500 transition-all flex-shrink-0"
                        title="Send private message"
                      >
                        <img 
                          src="/icons/ChatIcon.svg" 
                          alt="Chat" 
                          className="w-5 h-5"
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
