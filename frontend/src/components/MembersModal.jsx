// frontend/src/components/MembersModal.jsx
import React from 'react';
import { UserPlus, UserCheck, Clock, Search } from 'lucide-react';
import AudioWaveform from './AudioWaveform';
import Avatar from './Avatar';
import { getBatchFriendshipStatuses, sendFriendRequest, acceptFriendRequest, inviteToSession, searchUsers } from '../services/api';
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
  contentRating = '', // content rating of session (e.g. 'Religious')
  // Mid-session invite
  isPrivateSession = false,
  activeSessionId = null, // session_id string for inviting
}) {
  // ✅ ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURNS
  const [friendshipStatuses, setFriendshipStatuses] = React.useState({}); // userId -> friendship status
  const [loadingFriendships, setLoadingFriendships] = React.useState(false);
  const [friendActionLoading, setFriendActionLoading] = React.useState({}); // userId -> boolean

  // Member search (auto-shown once the room has enough members to need it)
  const [memberSearch, setMemberSearch] = React.useState('');

  // Invite panel state
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviteQuery, setInviteQuery] = React.useState('');
  const [inviteResults, setInviteResults] = React.useState([]);
  const [inviteSearching, setInviteSearching] = React.useState(false);
  const [inviteSending, setInviteSending] = React.useState({});
  const inviteDebounceRef = React.useRef(null);

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

  // Dynamic title based on content rating and watch type
  const getModalTitle = () => {
    if (contentRating === 'Religious') return 'Church Members';
    if (watchType === '3d_cinema') return 'Cinema Members';
    if (watchType === 'classroom' || watchType === 'lecture_hall') return 'Lecture Hall Members';
    return 'WatchOut Members';
  };

  // ✅ CONDITIONAL RETURN AFTER ALL HOOKS
  const handleInviteSearch = (q) => {
    setInviteQuery(q);
    clearTimeout(inviteDebounceRef.current);
    if (q.trim().length < 2) { setInviteResults([]); return; }
    inviteDebounceRef.current = setTimeout(async () => {
      setInviteSearching(true);
      try {
        const data = await searchUsers(q.trim());
        const existingIds = new Set(members.map(m => m.id));
        setInviteResults((data.users || []).filter(u => !existingIds.has(u.id)));
      } catch { /* silent */ } finally { setInviteSearching(false); }
    }, 350);
  };

  const handleSendInvite = async (user) => {
    if (!activeSessionId) return;
    setInviteSending(prev => ({ ...prev, [user.id]: true }));
    try {
      await inviteToSession(activeSessionId, user.id);
      toast.success(`Invite sent to @${user.username}`);
      setInviteResults(prev => prev.filter(u => u.id !== user.id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invite');
    } finally {
      setInviteSending(prev => ({ ...prev, [user.id]: false }));
    }
  };

  // Filter by search text, then bubble currently-speaking members to the top
  // (stable partition — relative order within each group is preserved so the
  // list doesn't reshuffle unnecessarily as people talk).
  const visibleMembers = React.useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const filtered = q
      ? members.filter(m => (m.username || '').toLowerCase().includes(q))
      : members;
    const speaking = [];
    const rest = [];
    filtered.forEach(m => {
      const state = audioStates[m.id] || {};
      if (state.isMuted === false && state.isSpeaking) speaking.push(m);
      else rest.push(m);
    });
    return [...speaking, ...rest];
  }, [members, memberSearch, audioStates]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-5 sm:p-6 pb-0 flex-shrink-0">
          {/* Mute Status Banner (always visible when mute-all is active) */}
          {isMuteAllActive && isHost && (
            <div className="mb-4 bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-500/50 rounded-lg p-3">
              <div className="text-purple-900 dark:text-white text-sm">
                🔇 {liveShareGuestId
                  ? `Audience Muted - Only you and ${members.find(m => m.id === liveShareGuestId)?.name || members.find(m => m.id === liveShareGuestId)?.username || 'guest'} can speak`
                  : 'All members muted - Only you can speak'}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-4 gap-2">
            <h3 className="text-gray-900 dark:text-white text-lg font-bold">
              {getModalTitle()} ({members.length})
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Mute All Toggle Button (Host only) — icon + label on one line */}
              {isHost && onMuteAll && (
                <button
                  onClick={onMuteAll}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full shadow-md hover:shadow-lg ${
                    isMuteAllActive
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  } text-white transition-all`}
                  title={isMuteAllActive ? "Unmute all members" : "Mute all members"}
                >
                  <span className="text-base leading-none">{isMuteAllActive ? '🔊' : '🔇'}</span>
                  <span className="text-xs font-semibold whitespace-nowrap">
                    {isMuteAllActive ? 'Unmute All' : 'Mute All'}
                  </span>
                </button>
              )}
              {/* Invite button — host only, requires active session */}
              {isHost && activeSessionId && (
                <button
                  onClick={() => { setShowInvite(v => !v); setInviteQuery(''); setInviteResults([]); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${showInvite ? 'bg-purple-600 text-white' : 'bg-purple-100 dark:bg-purple-600/20 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-600/40'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  Invite
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* Member search — only shows up once there are enough members to need it */}
          {members.length > 8 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full bg-gray-100 dark:bg-gray-700/50 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 rounded-lg pl-9 pr-3 py-2 outline-none border border-gray-200 dark:border-gray-600 focus:border-purple-500"
              />
            </div>
          )}

          {/* Invite search panel */}
          {showInvite && isHost && activeSessionId && (
            <div className="mb-4 p-3 bg-purple-50 dark:bg-gray-700/50 rounded-lg border border-purple-200 dark:border-purple-500/30">
              <p className="text-xs text-purple-700 dark:text-purple-300 font-semibold mb-2">
                {isPrivateSession ? '🔒 Private session — invitee gets room access + DM' : '🔗 Send a watch invite DM'}
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={inviteQuery}
                  onChange={e => handleInviteSearch(e.target.value)}
                  placeholder="Search by username…"
                  className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 rounded-lg px-3 py-2 outline-none border border-gray-300 dark:border-gray-600 focus:border-purple-500"
                  autoFocus
                />
                {inviteSearching && (
                  <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {inviteResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {inviteResults.map(u => (
                    <div key={u.id} className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-gray-800/60 rounded-lg shadow-sm">
                      <span className="text-sm text-gray-900 dark:text-white">@{u.username}</span>
                      <button
                        onClick={() => handleSendInvite(u)}
                        disabled={inviteSending[u.id]}
                        className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors"
                      >
                        {inviteSending[u.id] ? '…' : 'Invite'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {inviteQuery.length >= 2 && !inviteSearching && inviteResults.length === 0 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">No friends found matching "{inviteQuery}"</p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-2 overflow-y-auto flex-1 min-h-0">
          {visibleMembers.length === 0 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
              {memberSearch ? `No members matching "${memberSearch}"` : 'No members yet'}
            </p>
          )}
          {visibleMembers.map(member => {
            const audioState = audioStates[member.id] || {};
            const audioLevel = audioState.audioLevel || 0;
            const isMuted = audioState.isMuted !== false; // Default to muted if no data
            const canBroadcast = broadcastPermissions[member.id] || false;
            const isRoomHost = member.user_role === 'host' || member.is_host;
            const theaterInfo = userTheaters[member.id];
            const hasBroadcastRequest = broadcastRequests.includes(member.id);

            return (
              <div
                key={member.id}
                className="bg-gray-100 dark:bg-gray-700/50 shadow-sm hover:shadow-md p-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                <div className="flex items-center justify-between">
                  {/* Left: Avatar + Name */}
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => onMemberClick?.(member)}
                  >
                    {/* Avatar */}
                    <Avatar
                      user={member}
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600"
                    />

                    {/* Name + Status */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-white font-medium">
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
                          <span className="text-gray-500 dark:text-gray-400 text-xs">
                            Row {theaterInfo.seat_row}, Seat {theaterInfo.seat_col}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Mute status + Friend + Message + Unmute + Broadcast — each a
                      small icon-on-top / tiny-label-below stack, bottom-aligned so labels
                      line up regardless of each icon's own height (the waveform is taller
                      than a plain icon). */}
                  <div className="flex items-end gap-1.5">
                    {/* Mute/speaking status — passive indicator, no box */}
                    <div className="flex flex-col items-center gap-1 px-1">
                      <div className="h-9 flex items-end">
                        {isMuted ? (
                          <span className="text-lg leading-none">🔇</span>
                        ) : (
                          <AudioWaveform audioLevel={audioLevel} color="#10b981" />
                        )}
                      </div>
                      <span className="text-[8px] font-semibold text-gray-500 dark:text-gray-400 leading-none whitespace-nowrap">
                        {isMuted ? 'Muted' : 'Unmuted'}
                      </span>
                    </div>

                    {/* Friend Button (Add Friend / Friends / Accept Request) — icon-only, tinted by state, tiny label below */}
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
                            className="flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg text-gray-400 dark:text-gray-500 cursor-not-allowed"
                            title="Already friends"
                          >
                            <UserCheck className="w-4 h-4" />
                            <span className="text-[8px] font-semibold leading-none whitespace-nowrap">Friends</span>
                          </button>
                        );
                      }

                      // Pending request sent by current user
                      if (status === 'pending' && isRequester) {
                        return (
                          <button
                            disabled
                            className="flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg text-gray-400 dark:text-gray-500 cursor-not-allowed"
                            title="Friend request sent"
                          >
                            <Clock className="w-4 h-4" />
                            <span className="text-[8px] font-semibold leading-none whitespace-nowrap">Sent</span>
                          </button>
                        );
                      }

                      // Pending request received from other user - show Accept button
                      if (status === 'pending' && !isRequester) {
                        return (
                          <button
                            onClick={() => handleFriendAction(member.id, 'accept')}
                            disabled={isLoading}
                            className="flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50 transition-colors"
                            title="Accept friend request"
                          >
                            <UserCheck className="w-4 h-4" />
                            <span className="text-[8px] font-semibold leading-none whitespace-nowrap">{isLoading ? '…' : 'Accept'}</span>
                          </button>
                        );
                      }

                      // Not friends - show Add Friend button
                      return (
                        <button
                          onClick={() => handleFriendAction(member.id, 'add')}
                          disabled={isLoading || loadingFriendships}
                          className="flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors"
                          title="Send friend request"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span className="text-[8px] font-semibold leading-none whitespace-nowrap">{isLoading ? '…' : 'Add'}</span>
                        </button>
                      );
                    })()}

                    {/* Message Icon (Opens private chat) — icon-only, no box, tiny label below */}
                    {member.id !== currentUserId && (
                      <button
                        onClick={() => onMemberClick?.(member)}
                        className="flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white transition-colors"
                        title="Send private message"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
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
                        <span className="text-[8px] font-semibold leading-none whitespace-nowrap">Message</span>
                      </button>
                    )}

                    {/* Unmute Button (Host only, when mute-all is active and member is muted and not exempt guest) — kept as a labeled action button, not a passive icon */}
                    {isHost && onUnmuteMember && isMuteAllActive && isMuted && member.id !== currentUserId && member.id !== liveShareGuestId && (
                      <button
                        onClick={() => onUnmuteMember(member.id)}
                        className="flex flex-col items-center gap-1 px-2 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all"
                        title="Unmute this member"
                      >
                        <span className="text-base leading-none">🔊</span>
                        <span className="text-[8px] font-semibold leading-none whitespace-nowrap">Unmute</span>
                      </button>
                    )}

                    {/* Request Broadcast Button (Non-Host, for own row) */}
                    {!isHost && member.id === currentUserId && !canBroadcast && !isRoomHost && onRequestBroadcast && (
                      <button
                        onClick={() => onRequestBroadcast()}
                        className="flex flex-col items-center gap-1 px-2 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all"
                        title="Request whole-room broadcast permission"
                      >
                        <span className="text-base leading-none">🎤</span>
                        <span className="text-[8px] font-semibold leading-none whitespace-nowrap">Request</span>
                      </button>
                    )}

                    {/* Broadcast Toggle (Host Only) - Hidden for video_watch */}
                    {isHost && !isRoomHost && member.id !== currentUserId && sessionId && watchType !== 'video_watch' && (
                      <button
                        onClick={() => onToggleBroadcast?.(member.id, !canBroadcast)}
                        className={`flex flex-col items-center gap-1 px-1.5 py-1 rounded-lg transition-all ${
                          canBroadcast
                            ? 'bg-blue-500 hover:bg-blue-600 text-white'
                            : hasBroadcastRequest
                            ? 'bg-orange-500 hover:bg-orange-600 text-white animate-pulse'
                            : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300'
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
                          className="h-4 w-4"
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
                        <span className="text-[8px] font-semibold leading-none whitespace-nowrap">
                          {canBroadcast ? 'Live' : hasBroadcastRequest ? 'Pending' : 'Grant'}
                        </span>
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