// frontend/src/components/MembersModal.jsx
import React from 'react';
import AudioWaveform from './AudioWaveform';
import Avatar from './Avatar';
import { getBatchFriendshipStatuses, sendFriendRequest, acceptFriendRequest } from '../services/api';
import toast from 'react-hot-toast';

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
  onMuteAll = null, // ✅ Callback to toggle mute all students
  isMuteAllActive = false, // ✅ Current mute-all toggle state
  onUnmuteMember = null, // ✅ Callback to unmute individual member (host only)
  raisedHands = [], // ✅ Array of {userId, username, timestamp}
  liveShareGuestId = null, // ✅ Selected guest ID for LiveShare (exempt from mute)
  memberEmotes = {}, // ✅ Map of userId -> {emote, timestamp} for displaying emotes on cards
}) {
  // ✅ ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURNS
  const [friendshipStatuses, setFriendshipStatuses] = React.useState({}); // userId -> friendship status
  const [loadingFriendships, setLoadingFriendships] = React.useState(false);
  const [friendActionLoading, setFriendActionLoading] = React.useState({}); // userId -> boolean

  React.useEffect(() => {
    if (isOpen && fetchMembers) {
      fetchMembers();
    }
  }, [isOpen, fetchMembers]);

  // Fetch friendship statuses when modal opens
  React.useEffect(() => {
    if (!isOpen || !currentUserId || members.length === 0) return;

    const fetchFriendshipStatuses = async () => {
      setLoadingFriendships(true);
      try {
        const userIds = members
          .filter(m => m.id !== currentUserId) // Exclude current user
          .map(m => m.id);
        
        if (userIds.length > 0) {
          const statuses = await getBatchFriendshipStatuses(userIds);
          setFriendshipStatuses(statuses);
          console.log('👥 [MembersModal] Fetched friendship statuses:', statuses);
        }
      } catch (error) {
        console.error('❌ [MembersModal] Failed to fetch friendship statuses:', error);
      } finally {
        setLoadingFriendships(false);
      }
    };

    fetchFriendshipStatuses();
  }, [isOpen, currentUserId, members]);

  // Handle Add Friend / Accept Request
  const handleFriendAction = async (userId, action) => {
    setFriendActionLoading(prev => ({ ...prev, [userId]: true }));
    
    try {
      if (action === 'add') {
        await sendFriendRequest(userId);
        toast.success('Friend request sent!');
        // Update local state
        setFriendshipStatuses(prev => ({
          ...prev,
          [userId]: { status: 'pending', is_requester: true }
        }));
      } else if (action === 'accept') {
        await acceptFriendRequest(userId);
        toast.success('Friend request accepted!');
        // Update local state
        setFriendshipStatuses(prev => ({
          ...prev,
          [userId]: { status: 'accepted' }
        }));
      }
    } catch (error) {
      console.error('❌ [MembersModal] Friend action failed:', error);
      toast.error(error.response?.data?.error || 'Failed to process request');
    } finally {
      setFriendActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  // 🔍 Debug: Log when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      console.log('🚪 [MembersModal] Modal OPENED');
      console.log('👥 [MembersModal] Members count:', members.length);
      console.log('🔊 [MembersModal] audioStates prop on open:', audioStates);
      console.log('🔊 [MembersModal] audioStates keys:', Object.keys(audioStates));
    } else {
      console.log('🚪 [MembersModal] Modal CLOSED');
    }
  }, [isOpen]);

  // 🔍 Debug: Track audioStates prop changes
  React.useEffect(() => {
    if (isOpen) {
      console.log('🔄 [MembersModal] audioStates prop CHANGED:', audioStates);
      Object.entries(audioStates).forEach(([userId, state]) => {
        console.log(`  User ${userId}:`, state);
      });
    }
  }, [audioStates, isOpen]);

  // 🔍 Debug: Log members data when modal opens
  React.useEffect(() => {
    if (isOpen && members.length > 0) {
      console.log('🔍 [MembersModal] Members data:', members);
      members.forEach(member => {
        console.log(`🔍 [MembersModal] Member ${member.id} (${member.username}):`, {
          avatar_url: member.avatar_url,
          hasAvatar: !!member.avatar_url,
          fullMemberData: member
        });
      });
    }
  }, [isOpen, members]);

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

  // Dynamic title based on watch type
  const getModalTitle = () => {
    if (watchType === '3d_cinema') return 'Cinema Members';
    if (watchType === 'classroom' || watchType === 'lecture_hall') return 'Lecture Hall Members';
    return 'Watch Party Members'; // video_watch or default
  };

  // ✅ CONDITIONAL RETURN AFTER ALL HOOKS
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
        {/* Mute Status Banner (always visible when mute-all is active) */}
        {isMuteAllActive && isHost && (
          <div className="mb-4 bg-purple-900/30 border border-purple-500/50 rounded-lg p-3">
            <div className="text-white text-sm">
              🔇 {liveShareGuestId 
                ? `Audience Muted - Only you and ${members.find(m => m.id === liveShareGuestId)?.name || members.find(m => m.id === liveShareGuestId)?.username || 'guest'} can speak`
                : 'All members muted - Only you can speak'}
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white text-lg font-bold">
            {getModalTitle()} ({members.length})
          </h3>
          <div className="flex items-center gap-3">
            {/* Mute All Toggle Button (Host only) */}
            {isHost && onMuteAll && (
              <button
                onClick={onMuteAll}
                className={`px-3 py-1.5 ${
                  isMuteAllActive 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                } text-white text-sm font-medium rounded transition-all`}
                title={isMuteAllActive ? "Unmute all members" : "Mute all members"}
              >
                {isMuteAllActive ? '🔊 Unmute All' : '🔇 Mute All'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
          </div>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {members.map(member => {
            const audioState = audioStates[member.id] || {};
            const isSpeaking = audioState.isSpeaking || false;
            const audioLevel = audioState.audioLevel || 0;
            const isMuted = audioState.isMuted !== false; // Default to muted if no data
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
                    <Avatar
                      user={member}
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-600"
                    />
                    
                    {/* Name + Status */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">
                          {member.username || `User ${member.id}`}
                        </span>
                        {/* Emote indicator (2 seconds, except raise hand) */}
                        {memberEmotes[member.id] && (
                          <span 
                            className="text-3xl animate-bounce" 
                            title="Recent emote"
                          >
                            {memberEmotes[member.id].emote}
                          </span>
                        )}
                        {/* Raised hand indicator (static until unmuted) */}
                        {raisedHands.some(h => h.userId === member.id) && (
                          <span className="text-2xl" title="Hand raised">
                            ✋
                          </span>
                        )}
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
                      
                      {/* Audio State with Waveform */}
                      <div className="flex items-center gap-2 mt-1">
                        {!isMuted ? (
                          <>
                            <AudioWaveform audioLevel={audioLevel} color="#10b981" />
                          </>
                        ) : (
                          <>
                            <span className="text-2xl">🔇</span>
                            <span className="text-xs text-gray-400">Muted</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: Unmute Button + Friend Button + Message Icon + Broadcast Toggle */}
                  <div className="flex items-center gap-2">
                    {/* Unmute Button (Host only, when mute-all is active and member is muted and not exempt guest) */}
                    {isHost && onUnmuteMember && isMuteAllActive && isMuted && member.id !== currentUserId && member.id !== liveShareGuestId && (
                      <button
                        onClick={() => onUnmuteMember(member.id)}
                        className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-all"
                        title="Unmute this member"
                      >
                        🔊 Unmute
                      </button>
                    )}
                    
                    {/* Friend Button (Add Friend / Friends / Accept Request) */}
                    {member.id !== currentUserId && (() => {
                      const friendStatus = friendshipStatuses[member.id];
                      const isLoading = friendActionLoading[member.id];
                      const status = friendStatus?.status || 'none';
                      const isRequester = friendStatus?.is_requester;

                      // Already friends
                      if (status === 'accepted') {
                        return (
                          <button
                            disabled
                            className="px-3 py-1.5 rounded bg-gray-600 text-gray-400 text-xs font-medium cursor-not-allowed flex items-center gap-1.5"
                            title="Already friends"
                          >
                            <img src="/icons/MembersIcon.svg" alt="" className="w-4 h-4 opacity-50" />
                            Friends
                          </button>
                        );
                      }

                      // Pending request sent by current user
                      if (status === 'pending' && isRequester) {
                        return (
                          <button
                            disabled
                            className="px-3 py-1.5 rounded bg-gray-600 text-gray-400 text-xs font-medium cursor-not-allowed flex items-center gap-1.5"
                            title="Friend request sent"
                          >
                            <img src="/icons/MembersIcon.svg" alt="" className="w-4 h-4 opacity-50" />
                            Sent
                          </button>
                        );
                      }

                      // Pending request received from other user - show Accept button
                      if (status === 'pending' && !isRequester) {
                        return (
                          <button
                            onClick={() => handleFriendAction(member.id, 'accept')}
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
                            title="Accept friend request"
                          >
                            <img src="/icons/MembersIcon.svg" alt="" className="w-4 h-4" />
                            {isLoading ? 'Accepting...' : 'Accept'}
                          </button>
                        );
                      }

                      // Not friends - show Add Friend button
                      return (
                        <button
                          onClick={() => handleFriendAction(member.id, 'add')}
                          disabled={isLoading || loadingFriendships}
                          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
                          title="Send friend request"
                        >
                          <img src="/icons/MembersIcon.svg" alt="" className="w-4 h-4" />
                          {isLoading ? 'Sending...' : 'Add Friend'}
                        </button>
                      );
                    })()}
                    
                    {/* Message Icon (Opens private chat) */}
                    {member.id !== currentUserId && (
                      <button
                        onClick={() => onMemberClick?.(member)}
                        className="p-2 rounded bg-gray-600 hover:bg-gray-500 text-white transition-all"
                        title="Send private message"
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
                            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" 
                          />
                        </svg>
                      </button>
                    )}
                    
                    {/* Request Broadcast Button (Non-Host, for own row) */}
                    {!isHost && member.id === currentUserId && !canBroadcast && !isRoomHost && onRequestBroadcast && (
                      <button
                        onClick={() => onRequestBroadcast()}
                        className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-all"
                        title="Request whole-room broadcast permission"
                      >
                        🎤 Request Broadcast
                      </button>
                    )}
                    
                    {/* Broadcast Toggle (Host Only) - Hidden for video_watch */}
                    {isHost && !isRoomHost && member.id !== currentUserId && sessionId && watchType !== 'video_watch' && (
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