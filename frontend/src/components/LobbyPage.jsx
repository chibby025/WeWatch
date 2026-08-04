// WeWatch/frontend/src/components/LobbyPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getRooms, deleteRoom, getActiveSessions, verifySessionExists, getSentFriendRequests, getAssetUrl, cdnThumb, searchUsers, sendFriendRequest, getLobbyGroups, getLobbyGroupMessages, sendLobbyGroupMessage, uploadLobbyGroupImage, uploadLobbyGroupVideo, uploadLobbyGroupDocument, uploadLobbyGroupVoiceNote, sendLobbyGroupWatchOut, startLobbyGroupCall, endLobbyGroupCall, createLobbyGroup, leaveLobbyGroup, deleteLobbyGroup, toggleRoomFavourite, joinRoom, clearAllNotifications, startCircleWatchout } from '../services/api';
import { TrashIcon, Bars3Icon, EllipsisVerticalIcon, ShareIcon, Cog6ToothIcon, ChartBarIcon, FilmIcon, PaperClipIcon, FaceSmileIcon, ChartBarSquareIcon, MicrophoneIcon, PaperAirplaneIcon, PhoneIcon, ArrowsPointingOutIcon, UsersIcon, UserIcon, VideoCameraIcon, AcademicCapIcon, HeartIcon, ChatBubbleLeftIcon, ArrowUpIcon, BellIcon, XMarkIcon, EyeIcon, ChatBubbleOvalLeftEllipsisIcon, BookmarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { HeartIcon as HeartOutlineIcon, ChatBubbleLeftIcon as ChatOutlineIcon, FaceSmileIcon as FaceSmileOutlineIcon, MicrophoneIcon as MicrophoneOutlineIcon, PaperClipIcon as PaperClipOutlineIcon, ChartBarSquareIcon as ChartBarSquareOutlineIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { Plus, Home, Search } from 'lucide-react';
import jwtDecodeUtil from '../utils/jwt';
import apiClient, { API_BASE_URL } from '../services/api';
import WatchTypeModal from './WatchTypeModal';
import ClassTypeModal from './modals/ClassTypeModal';
import AccessModal from './AccessModal';
import InstantWatchInfoModal from './InstantWatchInfoModal';
import toast, { Toaster } from 'react-hot-toast';
import Avatar from './Avatar';
import LobbyLeftSidebar from './LobbyLeftSidebar';
import CallHistoryModal from './CallHistoryModal';
import UserProfileModal from './UserProfileModal';
import LobbyGroupInfoModal from './LobbyGroupInfoModal';
import { buildRoomShareUrl } from '../utils/roomShare';
import SettingsModal from './SettingsModal';
import CreateNewModal from './CreateNewModal';
import OnboardingTour from './OnboardingTour';
import PostUploadModal from './PostUploadModal';
import PostViewModal from './PostViewModal';
import DiscoverFeed from './DiscoverFeed';
import DeleteRoomModal from './DeleteRoomModal';
import EventsPreviewModal from './EventsPreviewModal';
import SessionPreview from './SessionPreview';
import { useAuth } from '../contexts/AuthContext';
import LobbyMessageBubble from './lobby/LobbyMessageBubble';
import WatchOutModal from './lobby/WatchOutModal';
import CircleOfFriendsSphere from './lobby/CircleOfFriendsSphere';
import LobbyAttachModal from './lobby/LobbyAttachModal';
import LobbyStickerPicker from './lobby/LobbyStickerPicker';
import LobbyPollCreator from './lobby/LobbyPollCreator';
import CalendarDropdown from './CalendarDropdown';
import CalendarModal from './CalendarModal';
import TicketPurchaseModal from './payment/TicketPurchaseModal';
import OutgoingCallModal from './lobby/OutgoingCallModal';
import IncomingCallModal from './lobby/IncomingCallModal';
import ActiveCallInterface from './lobby/ActiveCallInterface';
import { Room, RoomEvent } from 'livekit-client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import DateOfBirthPromptModal from './DateOfBirthPromptModal';
import { checkDateOfBirth, updateDateOfBirth } from '../services/api';
import SessionChatPreviewModal from './SessionChatPreviewModal';
import { formatCount } from '../utils/formatCount';
import TwemojiText from './TwemojiText';
import ReportModal from './ReportModal';
import TikTokHeartAnimation, { makeHeart } from './TikTokHeartAnimation';
import StatusRow from './StatusRow';
import StatusViewer from './StatusViewer';
import StatusCreator from './StatusCreator';
import StatusPrivacySheet from './StatusPrivacySheet';
import { getStatusFeed } from '../services/api';
import FeedAdCard from './ads/FeedAdCard';
import { calculateAge } from '../utils/ageUtils';
import CommunityEventsCard from './community/CommunityEventsCard';
import { getCommunityEvents, getPublicLiveSessions, getPublicRooms, getRoomsLeaderboard } from '../services/api';
import SessionShareModal from './SessionShareModal';
import { prefetchRoom } from '../utils/prefetchCache';

// Resolve a backend-relative preview URL to a full absolute URL
const resolvePreviewUrl = (url) => {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Frontend-hosted static assets (game posters: /images/ttt.webp, rps.webp, etc.)
  // live in frontend/public/ and are served by this app's own origin — prepending
  // the backend API base here points the browser at a route that doesn't exist on
  // the backend, which the browser then blocks as an invalid image response. Only
  // backend-hosted paths (/uploads/...) need the API base prepended.
  if (url.startsWith('/images/')) return url;
  return `${API_BASE_URL}${url}`;
};

const isImageUrl = (url) => /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url || '');

// CSS for custom pulsing animations
const pulseAnimationStyles = `
  @keyframes pulseRed {
    0%, 100% { color: #ef4444; opacity: 1; }
    50%       { color: #dc2626; opacity: 0.8; }
  }
  @keyframes scaleSquare {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.1); }
  }
  @keyframes floatZzz {
    0%   { opacity: 0;   transform: translateY(0)   scale(0.7); }
    20%  { opacity: 0.9; }
    80%  { opacity: 0.6; }
    100% { opacity: 0;   transform: translateY(-60px) scale(1.2); }
  }
  @keyframes communityPeek {
    0%, 60%, 100% { transform: translateY(100%); opacity: 0; }
    70%, 90%      { transform: translateY(0);    opacity: 1; }
  }
  .pulse-red-cross { animation: pulseRed 1.5s ease-in-out infinite; }
  .scale-square    { animation: scaleSquare 1.5s ease-in-out infinite; }
  .zzz-1 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 0s; }
  .zzz-2 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 0.8s; }
  .zzz-3 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 1.6s; }
  .community-peek { animation: communityPeek 4s ease-in-out infinite; animation-delay: 2s; }
`;

// Module-level stale-while-revalidate cache (survives tab switches, cleared on unmount)
const _lobbyCache = {
  rooms: null, roomsTs: 0, roomsFp: '',
  sessions: null, sessionsTs: 0, sessionsFp: '',
  friends: null, friendsTs: 0, friendsFp: '',
  dms: new Map(), // key: friendId → last 30 messages (survives tab switches)
  sessionsPageData: null, // WatchOuts feed cards — survives unmount/remount so back-nav is instant
};
// Cheap fingerprint: join id + a volatile field so we catch joins/renames/previews.
const _roomsFp  = (arr) => arr.map(r => `${r.id}:${r.updated_at || ''}:${r.member_count ?? ''}`).join('|');
const _sessionsFp = (arr) => arr.map(s => `${s.session_id}:${s.member_count ?? ''}:${s.preview_url || ''}`).join('|');
const _friendsFp = (arr) => arr.map(f => `${f.id}:${f.username || ''}:${f.last_message?.content || ''}:${f.last_message?.created_at || ''}`).join('|');
const CACHE_TTL = 300_000; // 5 min — WS + 30s poll keep data fresh; back-navigation should always be instant

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
};

const formatChatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
     new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const LobbyPage = () => {
  // ✅ Tab State
  // Default to Watching Live if we have cached sessions, otherwise Rooms
  const [activeTab, setActiveTab] = useState(() => {
    // Restore last tab on refresh; use smart default only on first visit
    const saved = localStorage.getItem('wewatch_last_tab');
    if (saved) return saved;
    return _lobbyCache.sessions?.length > 0 ? 'watching' : 'rooms';
  });
  
  // ✅ Data Saver State
  const [dataSaverEnabled, setDataSaverEnabled] = React.useState(
    localStorage.getItem('dataSaverMode') === 'true'
  );
  
  // Listen for localStorage changes (when toggled in sidebar or another tab)
  React.useEffect(() => {
    const checkDataSaver = () => {
      setDataSaverEnabled(localStorage.getItem('dataSaverMode') === 'true');
    };
    window.addEventListener('storage', checkDataSaver);
    window.addEventListener('dataSaverModeChange', checkDataSaver);
    return () => {
      window.removeEventListener('storage', checkDataSaver);
      window.removeEventListener('dataSaverModeChange', checkDataSaver);
    };
  }, []);
  
  // Persist active tab so refresh returns user to where they were
  useEffect(() => {
    localStorage.setItem('wewatch_last_tab', activeTab);
  }, [activeTab]);

  // Show the one-time onboarding tour right after a fresh signup (flag set in Register.jsx)
  useEffect(() => {
    if (localStorage.getItem('wewatch_show_onboarding_tour')) {
      setIsOnboardingTourOpen(true);
    }
  }, []);

  // 🔔 Notification state
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [upcomingEventsCount, setUpcomingEventsCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [rooms, setRooms] = useState(() => _lobbyCache.rooms || []);
  const [sessions, setSessions] = useState(() => _lobbyCache.sessions || []); // ✅ Active watch sessions
  const [loading, setLoading] = useState(() => !_lobbyCache.rooms);
  const [sessionsLoading, setSessionsLoading] = useState(() => !_lobbyCache.sessions); // ✅ Separate loading for sessions
  const [error, setError] = useState(null);
  
  // ✅ Infinite Scroll State
  const [roomsPage, setRoomsPage] = useState(0);
  const [hasMoreRooms, setHasMoreRooms] = useState(true);
  const [loadingMoreRooms, setLoadingMoreRooms] = useState(false);
  const roomsObserverTarget = React.useRef(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const [currentDisplay, setCurrentDisplay] = useState('current'); // 'current' or 'next'
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [isInstantWatchInfoModalOpen, setIsInstantWatchInfoModalOpen] = useState(false);
  const [isWatchTypeModalOpen, setIsWatchTypeModalOpen] = useState(false);
  const [isClassTypeModalOpen, setIsClassTypeModalOpen] = useState(false);
  const [selectedWatchType, setSelectedWatchType] = useState(null);
  const [selectedClassType, setSelectedClassType] = useState(null);
  const [selectedIsPublic, setSelectedIsPublic] = useState(true); // Store access choice
  const [selectedIsPrivate, setSelectedIsPrivate] = useState(false); // Store session privacy choice
  const [selectedContentRating, setSelectedContentRating] = useState('G'); // Store content rating
  
  // ✅ Circle of Friends state — member IDs persisted in localStorage
  const [showCircleSphere, setShowCircleSphere] = useState(false);
  const [circleOfFriendsIds, setCircleOfFriendsIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('circleOfFriends') || '[]'); }
    catch { return []; }
  });

  // ✅ Status / Stories state
  const [statusFeed, setStatusFeed] = useState([]);
  const [viewingStatus, setViewingStatus] = useState(null); // StatusFeedUser being viewed
  const [showStatusCreator, setShowStatusCreator] = useState(false);
  const [showStatusPrivacy, setShowStatusPrivacy] = useState(false);

  // ✅ Lobby Chat State
  const [friendsList, setFriendsList] = useState(() => _lobbyCache.friends || []); // Users to chat with
  const [selectedChatUser, setSelectedChatUser] = useState(null); // Currently open chat
  const [lightboxAvatarUser, setLightboxAvatarUser] = useState(null); // Avatar lightbox target (clicked avatar in chat tab)
  const [chatMessages, setChatMessages] = useState({}); // { userId: [messages] }
  const [newChatMessage, setNewChatMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // message being replied to
  const [chatsLoading, setChatsLoading] = useState(false);
  // Windowed rendering for the merged groups+friends chat list — the full list
  // is already fetched (friendsList/groupsList are needed complete elsewhere,
  // e.g. "already a friend?" checks and group member pickers), this just caps
  // how many rows render at once, revealing more as the user scrolls near the
  // bottom. Resets to the initial page whenever the list is (re-)entered or
  // filtered, so a stale scroll position doesn't leave it stuck expanded/short.
  const CHAT_LIST_PAGE_SIZE = 10;
  const [visibleChatItemCount, setVisibleChatItemCount] = useState(CHAT_LIST_PAGE_SIZE);
  const chatItemsTotalRef = React.useRef(0); // total merged item count from the latest render, read by the scroll handler
  const [unreadCounts, setUnreadCounts] = useState({}); // { userId: count }
  const [friendsSearchTerm, setFriendsSearchTerm] = useState(''); // Search friends
  const [chatView, setChatView] = useState('friends'); // 'friends' or 'messages'
  const [lastMessagePreviews, setLastMessagePreviews] = useState({}); // { userId: lastMessage }
  const [onlineStatus, setOnlineStatus] = useState({}); // { userId: boolean }
  
  // ✅ Chat Enhancement Modals State
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [isPollCreatorOpen, setIsPollCreatorOpen] = useState(false);
  const [showWatchOutModal, setShowWatchOutModal] = useState(false);

  // ✅ WatchOut State — live rooms available to share
  const [liveRooms, setLiveRooms] = useState([]);
  // Tracks session_ids that ended via WS so private WatchOut cards grey out
  const [endedSessionIds, setEndedSessionIds] = useState(new Set());
  const [reportTarget, setReportTarget] = useState(null); // { targetType, targetId, targetName }
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [chatProfileUser, setChatProfileUser] = useState(null); // user whose profile to view

  // ✅ Add Friend / unified chats search state
  const [showChatsSearch, setShowChatsSearch] = useState(false);
  const [showAddFriendSearch, setShowAddFriendSearch] = useState(false);
  const [addFriendQuery, setAddFriendQuery] = useState('');
  const [addFriendResults, setAddFriendResults] = useState([]);
  const [addFriendLoading, setAddFriendLoading] = useState(false);
  const [sentFriendRequestIds, setSentFriendRequestIds] = useState(new Set());
  
  // ✅ Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);
  const recordingTimerRef = React.useRef(null);
  
  // ✅ Call State
  const [outgoingCall, setOutgoingCall] = useState(null); // { user, status: 'calling'|'declined'|'busy'|'no_answer' }
  const [incomingCall, setIncomingCall] = useState(null); // { user, callId }
  const [activeCall, setActiveCall] = useState(null); // { user, room, roomName }
  const [callRoom, setCallRoom] = useState(null); // LiveKit Room instance
  const callTimeoutRef = React.useRef(null);
  const callRingtoneRef = React.useRef(null);
  
  // ✅ Group Chat State
  const [groupsList, setGroupsList] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState({}); // { groupId: [messages] }
  const [groupUnreadCounts, setGroupUnreadCounts] = useState({}); // { groupId: unreadCount }
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembersForGroup, setSelectedMembersForGroup] = useState([]);
  const [incomingGroupCall, setIncomingGroupCall] = useState(null);
  const [activeGroupCall, setActiveGroupCall] = useState(null);
  const [groupCallRoom, setGroupCallRoom] = useState(null);
  const [newGroupChatMessage, setNewGroupChatMessage] = useState('');
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [isGroupInfoModalOpen, setIsGroupInfoModalOpen] = useState(false);
  const [expandedGroupIcon, setExpandedGroupIcon] = useState(null); // { url, name } | null

  // ✅ Friend Request State
  const [pendingRequests, setPendingRequests] = useState([]); // Friend requests received
  const [sentRequests, setSentRequests] = useState([]); // Friend requests sent
  const [activeRequestsTab, setActiveRequestsTab] = useState('friends'); // 'friends' or 'requests'
  const [friendMenuOpen, setFriendMenuOpen] = useState(null); // Track which friend menu is open
  
  // ✅ Expanded View State (null, 'friends', or 'chat')
  const [expandedView, setExpandedView] = useState(null);
  
  // ✅ Fullscreen Watching Now State
  const [isWatchingNowFullscreen, setIsWatchingNowFullscreen] = useState(false);
  const [fullscreenSessionIndex, setFullscreenSessionIndex] = useState(0);
  const fullscreenScrollRef = React.useRef(null);
  
  // ✅ Left Sidebar & Modals State
  const [isLobbyLeftSidebarOpen, setIsLobbyLeftSidebarOpen] = useState(false);
  const [isCallHistoryModalOpen, setIsCallHistoryModalOpen] = useState(false);
  const [showGuestBanner, setShowGuestBanner] = useState(false);
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false);
  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCreateNewModalOpen, setIsCreateNewModalOpen] = useState(false);
  const [isOnboardingTourOpen, setIsOnboardingTourOpen] = useState(false);
  const [isPostUploadModalOpen, setIsPostUploadModalOpen] = useState(false);
  const [isRoomExplainerOpen, setIsRoomExplainerOpen] = useState(false);
  const [openMenuRoomId, setOpenMenuRoomId] = useState(null);
  const [openMenuPosition, setOpenMenuPosition] = useState(null); // { top, right } in viewport coords
  const [shareSheetRoom, setShareSheetRoom] = useState(null); // { id, name } for share options panel
  const [openRoomContextMenuId, setOpenRoomContextMenuId] = useState(null); // non-host room menu
  const [roomToDelete, setRoomToDelete] = useState(null);
  
  // ✅ Events Preview Modal State
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [selectedRoomForEvents, setSelectedRoomForEvents] = useState(null);
  
  // ✅ Post View Modal State
  const [isPostViewModalOpen, setIsPostViewModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);

  // ✅ Ticket Purchase Modal State
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [selectedSessionForTicket, setSelectedSessionForTicket] = useState(null);
  
  // ✅ Calendar Modal State (for trailers)
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [selectedEventForCalendar, setSelectedEventForCalendar] = useState(null);

  // Calendar drawer state
  const [showCalendarDrawer, setShowCalendarDrawer] = useState(false);
  const [showTabHint, setShowTabHint] = useState(true);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  
  // ✅ Hover state for session cards
  const [hoveredSession, setHoveredSession] = useState(null);
  
  // ✅ Date of Birth Prompt Modal State
  const [isDOBPromptOpen, setIsDOBPromptOpen] = useState(false);
  const [isDOBSubmitting, setIsDOBSubmitting] = useState(false);
  
  // ✅ Create Button Discovery State (First-time user guidance)
  const [showCreateButtonPulse, setShowCreateButtonPulse] = useState(
    !localStorage.getItem('hasSeenCreateButton')
  );

  // WebSocket state for lobby real-time updates
  const wsRef = React.useRef(null);
  const [wsConnected, setWsConnected] = React.useState(false);
  const fetchAbortRef = React.useRef({}); // keyed abort controllers for cancellable fetches
  const sessionsFetchDebounceRef = React.useRef(null); // debounce rapid session_started bursts
  // Refs that shadow volatile state so onmessage never reads stale closures
  const outgoingCallRef      = React.useRef(null);
  const activeGroupCallRef   = React.useRef(null);
  const activeChatSessionRef = React.useRef(null);
  
  // Session preview state
  const [sessionPreviews, setSessionPreviews] = useState({}); // { sessionId: { posterUrl, previewUrl, isGenerating } }
  
  // ✅ Session Likes State
  const [sessionLikes, setSessionLikes] = useState({}); // { sessionId: { count, isLiked } }
  
  // ✅ Session Chat Counts State
  const [sessionChatCounts, setSessionChatCounts] = useState({}); // { sessionId: messageCount }

  // ✅ Room Favourite + Join State (from session preview cards)
  const [savedRooms, setSavedRooms] = useState({});   // { roomId: bool }
  const [joinedRooms, setJoinedRooms] = useState({}); // { roomId: 'active' | 'pending' }
  const [shareModalSession, setShareModalSession] = useState(null);
  
  // ✅ Chat Preview Modal State (OLD - kept for backward compatibility)
  const [isChatPreviewOpen, setIsChatPreviewOpen] = useState(false);
  const [selectedSessionForChat, setSelectedSessionForChat] = useState(null);
  
  // 💬 Interactive Session Chat State (70-30 Split Mode)
  const [activeChatSession, setActiveChatSession] = useState(null); // Session object with chat open
  const [sessionChatMessages, setSessionChatMessages] = useState([]); // Real-time session chat messages
  const chatIntervalRef = React.useRef(null); // interval id for session chat polling (not state — avoids re-renders)
  const [isChatConnecting, setIsChatConnecting] = useState(false);
  
  // ❤️ Like Animation State
  const [heartAnimations, setHeartAnimations] = useState([]);
  const lastLikeTimeRef = React.useRef({});
  const roomLongPressRef = React.useRef(null);
  const roomLongPressActive = React.useRef(false);
  
  // Helper: Get content rating glow color (matches PricingModal)
  const getRatingGlowColor = (rating) => {
    switch(rating) {
      case 'G': return 'drop-shadow(0 0 20px rgba(74, 222, 128, 0.8))';
      case 'PG': return 'drop-shadow(0 0 20px rgba(96, 165, 250, 0.8))';
      case '13+': return 'drop-shadow(0 0 20px rgba(250, 204, 21, 0.8))';
      case '18+': return 'drop-shadow(0 0 20px rgba(248, 113, 113, 0.8))';
      case 'Mature': return 'drop-shadow(0 0 20px rgba(192, 132, 252, 0.8))';
      default: return 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))';
    }
  };
  
  // ✅ Infinite Scroll State for "Watching Now"
  const [watchingSubTab, setWatchingSubTab] = useState('sessions'); // 'sessions' or 'discover'
  const [sessionsPage, setSessionsPage] = useState(() => ({
    data: _lobbyCache.sessionsPageData || [],
    offset: 0,
    hasMore: true,
    loading: false
  }));
  const [trailersPage, setTrailersPage] = useState({ 
    data: [], 
    offset: 0, 
    hasMore: true,
    loading: false 
  });
  const [isRefreshingWatchingNow, setIsRefreshingWatchingNow] = useState(false);
  
  // 🔍 Discover Search State
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [showDiscoverSearch, setShowDiscoverSearch] = useState(false);
  const [showSessionSearch, setShowSessionSearch] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  // scroll position memory per feed tab
  const sessionsScrollPosRef = React.useRef(0);
  const forYouScrollPosRef = React.useRef(0);
  const touchStartRef = React.useRef({ x: 0, y: 0 });
  const swipeStateRef = React.useRef({ startX: 0, startY: 0, locked: null });

  // Community Events carousel data
  const [communityEventsData, setCommunityEventsData] = useState({ scheduledEvents: [], requests: [] });
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [vsBattleLeaderboardData, setVsBattleLeaderboardData] = useState([]);
  const [showCommunityEventsView, setShowCommunityEventsView] = useState(false);
  const communityEventsTuneRef = React.useRef(null);
  const [communityCardVisible, setCommunityCardVisible] = React.useState(false);

  // 🪟 Modal state for W button (hides Post option when opened from Watching Live)
  const [createModalHidePosts, setCreateModalHidePosts] = React.useState(false);

  // 🔍 Rooms search visibility (taskbar Search toggles this)
  const [showRoomsSearch, setShowRoomsSearch] = React.useState(false);

  // 🗂️ Member Rooms Card (collapses when memberRooms.length > 10)
  const [isMemberCardExpanded, setIsMemberCardExpanded] = React.useState(false);
  // 🗂️ Groups Card (collapses when groupsList.length > 10)
  const [isGroupsCardExpanded, setIsGroupsCardExpanded] = React.useState(false);
  
  // 🎯 Feed Ads State
  const [feedAds, setFeedAds] = useState([]);
  const [fetchingFeedAds, setFetchingFeedAds] = useState(false);
  
  // 🔇 Video Mute State (persistent across sessions)
  const [videoMuted, setVideoMuted] = useState(() => {
    const saved = localStorage.getItem('videoAutoplayMuted');
    return saved === null ? false : saved === 'true'; // Default unmuted
  });
  
  // ✅ Infinite scroll refs
  const watchingNowScrollRef = React.useRef(null);
  const loadMoreTriggerRef = React.useRef(null);
  const discoverFeedRef = React.useRef(null);
  const tabBarRef = React.useRef(null);
  const [watchingTopOffset, setWatchingTopOffset] = React.useState(190);
  const [watchingBottomPad, setWatchingBottomPad] = React.useState(64);
  
  // ✅ Get current user from Auth Context
  const { currentUser, wsToken, refreshUser, loading: authLoading } = useAuth();
  
  // Use currentUser.id for authenticated user ID
  const authenticatedUserID = currentUser?.id || null;
  
  // 🔇 Toggle video mute state and save to localStorage
  const toggleVideoMute = () => {
    setVideoMuted(prev => {
      const newMuted = !prev;
      localStorage.setItem('videoAutoplayMuted', String(newMuted));
      return newMuted;
    });
  };
  
  // Show soft auth sheet before any write interaction that genuinely needs an account
  const requireAuth = (action) => {
    if (!currentUser) { setShowAuthSheet(true); return; }
    action();
  };

  // ❤️ Handle session like/unlike (single click to toggle)
  const handleSessionLike = async (sessionId, e) => {
    e.stopPropagation();

    const currentLikeState = sessionLikes[sessionId] || { count: 0, isLiked: false };

    // Guests: local-only toggle with a soft nudge, no API call
    if (!currentUser) {
      const next = !currentLikeState.isLiked;
      setSessionLikes(prev => ({
        ...prev,
        [sessionId]: { count: next ? currentLikeState.count + 1 : Math.max(0, currentLikeState.count - 1), isLiked: next },
      }));
      if (next) {
        setHeartAnimations(prev => [...prev, makeHeart()]);
        toast('Sign in to save your likes', { icon: '✨', duration: 2500 });
      }
      return;
    }
    
    // Toggle: If already liked, unlike. If not liked, like.
    if (currentLikeState.isLiked) {
      // Unlike
      // Optimistic update
      setSessionLikes(prev => ({
        ...prev,
        [sessionId]: {
          count: Math.max(0, currentLikeState.count - 1),
          isLiked: false
        }
      }));
      
      try {
        await apiClient.delete(`/api/sessions/${sessionId}/unlike`);
      } catch (err) {
        console.error('Failed to unlike session:', err);
        // Revert on error
        setSessionLikes(prev => ({
          ...prev,
          [sessionId]: {
            count: currentLikeState.count,
            isLiked: true
          }
        }));
      }
    } else {
      // Like
      setHeartAnimations(prev => [...prev, makeHeart()]);
      
      // Optimistic update
      setSessionLikes(prev => ({
        ...prev,
        [sessionId]: {
          count: currentLikeState.count + 1,
          isLiked: true
        }
      }));
      
      try {
        await apiClient.post(`/api/sessions/${sessionId}/like`);
      } catch (err) {
        console.error('Failed to like session:', err);
        // Revert on error
        setSessionLikes(prev => ({
          ...prev,
          [sessionId]: {
            count: currentLikeState.count,
            isLiked: false
          }
        }));
      }
    }
  };
  
  // 💬 Handle opening interactive chat (70-30 split mode)
  const handleOpenChatPreview = (session, e) => {
    e.stopPropagation();
    setSelectedSessionForChat(session);
    setIsChatPreviewOpen(true);
  };

  const handleToggleFavourite = async (roomId, e) => {
    e.stopPropagation();
    if (!currentUser) { setShowAuthSheet(true); return; }
    try {
      const res = await toggleRoomFavourite(roomId);
      setSavedRooms(prev => ({ ...prev, [roomId]: res.is_favourite }));
    } catch { /* silent */ }
  };

  const handleJoinRoomFromCard = async (roomId, e) => {
    e.stopPropagation();
    if (!currentUser) { setShowAuthSheet(true); return; }
    if (joinedRooms[roomId]) return;
    try {
      const res = await joinRoom(roomId);
      setJoinedRooms(prev => ({ ...prev, [roomId]: res.status || 'active' }));
    } catch { /* silent */ }
  };
  
  // 🔌 Connect to session chat via REST API polling
  const connectToSessionChat = (session) => {
    const fetchMessages = async () => {
      try {
        const response = await apiClient.get(`/api/sessions/${session.session_id}/chat-preview`);
        const messages = response.data.messages || [];
        setSessionChatMessages(messages);
        
        // Update chat count from message array length
        setSessionChatCounts(prev => ({
          ...prev,
          [session.session_id]: messages.length
        }));
        
        setIsChatConnecting(false);
      } catch (err) {
        setIsChatConnecting(false);
      }
    };

    // Initial fetch
    fetchMessages();
    
    // Poll every 2 seconds while chat is open
    const interval = setInterval(fetchMessages, 2000);
    chatIntervalRef.current = interval;
  };
  
  // 🚪 Close interactive chat
  const handleCloseChatPreview = () => {
    if (chatIntervalRef.current) {
      clearInterval(chatIntervalRef.current);
      chatIntervalRef.current = null;
    }
    setActiveChatSession(null);
    setSessionChatMessages([]);
  };
  
  // 📱 Touch gesture handling for swipe down to close chat
  const [touchStartY, setTouchStartY] = useState(null);
  const [touchEndY, setTouchEndY] = useState(null);
  
  const handleChatTouchStart = (e) => {
    setTouchStartY(e.touches[0].clientY);
  };
  
  const handleChatTouchMove = (e) => {
    setTouchEndY(e.touches[0].clientY);
  };
  
  const handleChatTouchEnd = () => {
    if (!touchStartY || !touchEndY) return;
    
    const distance = touchEndY - touchStartY;
    const isDownSwipe = distance > 100; // Swipe down at least 100px
    
    if (isDownSwipe) {
      handleCloseChatPreview();
    }
    
    setTouchStartY(null);
    setTouchEndY(null);
  };
  
  // 🧹 Cleanup session chat polling interval on unmount
  // Keep module-level cache in sync with WatchOuts feed so back-navigation renders cards instantly.
  useEffect(() => {
    if (sessionsPage.data.length > 0) {
      _lobbyCache.sessionsPageData = sessionsPage.data;
    }
  }, [sessionsPage.data]);

  useEffect(() => {
    return () => {
      if (chatIntervalRef.current) clearInterval(chatIntervalRef.current);
    };
  }, []);
  
  // 📐 Measure tab bar bottom so the watching view fills exactly the remaining height.
  // useEffect (not useLayoutEffect) so measurement is async and doesn't block tab-switch paint.
  React.useEffect(() => {
    const measure = () => {
      if (tabBarRef.current) {
        const bottom = tabBarRef.current.getBoundingClientRect().bottom;
        setWatchingTopOffset(prev => (prev === bottom ? prev : bottom));
      }
      // Reduce the bottom gap on desktop where there is no fixed bottom nav
      setWatchingBottomPad(window.innerWidth >= 1024 ? 8 : 64);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeTab]);

  // Detect when a community card snap item is ≥80% visible inside the scroll container.
  // Drives pseudo-fullscreen (container goes position:fixed) and music playback.
  React.useEffect(() => {
    const container = watchingNowScrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const anyVisible = entries.some(e => e.isIntersecting && e.intersectionRatio >= 0.8);
        setCommunityCardVisible(prev => (prev === anyVisible ? prev : anyVisible));
      },
      { root: container, threshold: 0.8 },
    );
    const cards = container.querySelectorAll('[data-community-card]');
    if (!cards.length) {
      setCommunityCardVisible(false);
      return () => observer.disconnect();
    }
    cards.forEach(c => observer.observe(c));
    return () => observer.disconnect();
  }, [sessionsPage.data.length, communityEventsData]);

  // 🧹 Close chat when exiting fullscreen
  useEffect(() => {
    if (!isWatchingNowFullscreen && activeChatSession) {
      handleCloseChatPreview();
    }
  }, [isWatchingNowFullscreen]);
  
  // ✅ Handle navigation state from RoomMembersModal
  useEffect(() => {
    if (location.state?.openChatWith && location.state?.activeTab === 'chats') {
      const userToChat = location.state.openChatWith;
      
      // Set active tab to chats
      setActiveTab('chats');
      
      // Open chat with the specified user
      handleSelectChatUser(userToChat);
      
      // Clear navigation state to prevent reopening on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }

    // Handle navigation from RoomTV (post click)
    if (location.state?.openPost) {
      const postId = location.state.openPost;
      const autoPlay = location.state.autoPlay || false;
      
      // Switch to the Feed tab (its own top-level tab — 'watching'/'discover'
      // was the old sub-tab structure before Feed was promoted out of it;
      // setting those no longer lands anywhere near the real feed).
      setActiveTab('feed');

      // Fetch and open the post
      apiClient.get(`/api/posts/${postId}`)
        .then(response => {
          setSelectedPost(response.data.post);
          setIsPostViewModalOpen(true);
          
          // If autoPlay is requested, trigger play (handled by PostViewModal)
          if (autoPlay) {
            // autoPlay state passed to PostViewModal
          }
        })
        .catch(error => {
          console.error('Failed to fetch post:', error);
          toast.error('Failed to load post');
        });
      
      // Clear navigation state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);
  
  // ✅ Chat message ref for auto-scroll
  const chatMessagesEndRef = React.useRef(null);
  const scrollToBottomChat = () => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Close ellipsis menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuRoomId && !event.target.closest('.room-menu')) {
        setOpenMenuRoomId(null);
        setOpenMenuPosition(null);
      }
      if (chatMenuOpen && !event.target.closest('.chat-options-menu')) {
        setChatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuRoomId, chatMenuOpen]);
  
  // ✅ Manage Create Button pulse for new users
  useEffect(() => {
    if (showCreateButtonPulse && activeTab === 'rooms') {
      const timer = setTimeout(() => {
        localStorage.setItem('hasSeenCreateButton', 'true');
        setShowCreateButtonPulse(false);
      }, 5000); // Pulse for 5 seconds
      return () => clearTimeout(timer);
    }
  }, [showCreateButtonPulse, activeTab]);
  
  // ✅ Check if user has provided date of birth on component mount
  useEffect(() => {
    const checkUserDOB = async () => {
      if (!authenticatedUserID) return;
      
      try {
        const response = await checkDateOfBirth();
        if (!response.has_dob) {
          setIsDOBPromptOpen(true);
        }
      } catch (error) {
        console.error('Error checking date of birth:', error);
        // Don't block user if check fails
      }
    };
    
    checkUserDOB();
  }, [authenticatedUserID]);
  
  // ✅ Handle DOB submission
  const handleDOBSubmit = async (dateOfBirth) => {
    setIsDOBSubmitting(true);
    
    try {
      await updateDateOfBirth(dateOfBirth);
      toast.success('Date of birth saved! You can now access all features.');
      setIsDOBPromptOpen(false);
      
      // Refresh user data
      if (refreshUser) {
        await refreshUser();
      }
    } catch (error) {
      console.error('Error updating date of birth:', error);
      const errorMessage = error.response?.data?.error || 'Failed to save date of birth. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsDOBSubmitting(false);
    }
  };

  // handle instant watch room creation
  // Add this inside LobbyPage component, alongside other handlers
  const handleInstantWatch = () => {
    // Check if user has dismissed the info modal
    const hideInfo = localStorage.getItem('hideInstantWatchInfo');
    if (!hideInfo) {
      setIsInstantWatchInfoModalOpen(true);
    } else {
      // Show access modal directly
      setIsAccessModalOpen(true);
    }
  };

  const handleInstantWatchInfoContinue = () => {
    setIsInstantWatchInfoModalOpen(false);
    setIsAccessModalOpen(true);
  };

  // ✅ Handle access selection (public/private + content rating)
  const handleAccessSelected = (isPublic, isPrivate, contentRating) => {
    setSelectedIsPublic(isPublic);
    setSelectedIsPrivate(isPrivate);
    setSelectedContentRating(contentRating || 'G');
    setIsAccessModalOpen(false);
    setIsWatchTypeModalOpen(true);
  };

  // ✅ Handle watch type selection for instant watch
  const handleWatchTypeSelected = (watchType) => {
    setSelectedWatchType(watchType);
    setIsWatchTypeModalOpen(false);

    // If classroom, show class type modal
    if (watchType === 'classroom') {
      setIsClassTypeModalOpen(true);
    } else {
      // Otherwise, create session immediately
      createInstantWatchSession(watchType, null);
    }
  };

  // ✅ Handle class type selection (for classroom)
  const handleClassTypeSelected = (classType) => {
    setSelectedClassType(classType);
    setIsClassTypeModalOpen(false);
    createInstantWatchSession('classroom', classType);
  };

  // ✅ Create instant watch session with watch type and optional class type
  const createInstantWatchSession = async (watchType, classType) => {
    try {
      setLoading(true);
      
      const requestBody = {
        watch_type: watchType,
        is_public: selectedIsPublic,
        is_private: selectedIsPrivate,
        content_rating: selectedContentRating || 'G' // Include content rating
      };
      
      // Add class_type if classroom
      if (watchType === 'classroom' && classType) {
        requestBody.class_type = classType;
      }
      
      const response = await apiClient.post('/api/rooms/instant-watch', requestBody);
      
      const { room_id, session } = response.data;
      const session_id = session.session_id;
      const watch_type = session.watch_type;
      const class_type = session.class_type;

      // Success message
      if (watch_type === '3d_cinema') {
        toast.success('Starting 3D Cinema...');
      } else if (watch_type === 'classroom') {
        toast.success(`Starting ${class_type === 'lecture_hall' ? 'Lecture Hall' : 'Classroom'}...`);
      } else {
        toast.success('Starting Video Watch...');
      }

      // Route to correct watch type
      if (watch_type === '3d_cinema') {
        navigate(`/cinema-3d-demo/${room_id}?session_id=${session_id}&instant=true`, {
          state: { isHost: true, sessionId: session_id }
        });
      } else if (watch_type === 'classroom') {
        const route = class_type === 'lecture_hall' ? 'lecture-hall' : 'classroom';
        navigate(`/classroom/${route}/${room_id}?session_id=${session_id}&instant=true`, {
          state: { isHost: true, sessionId: session_id, classType: class_type }
        });
      } else {
        navigate(`/watch/${room_id}?session_id=${session_id}&instant=true`);
      }
    } catch (err) {
      console.error('Failed to start instant watch:', err);
      setError('Could not start instant watch. Please try again.');
      toast.error('Failed to start instant watch');
    } finally {
      setLoading(false);
    }
  };

  // Add effect for auto-rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDisplay(prev => prev === 'current' ? 'next' : 'current');
    }, 3000);
  
    return () => clearInterval(interval);
  }, []);
  
  // Close friend menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (friendMenuOpen && !e.target.closest('.friend-menu-container')) {
        setFriendMenuOpen(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [friendMenuOpen]);

  // Sort rooms: owned rooms pinned first, member rooms sorted by content-rating proximity
  const RATING_ORDER = ['G', 'PG', 'Educational', 'Religious', '13+', '16+', '18+', 'Mature'];
  const sortRooms = (roomsToSort) => {
    const owned = roomsToSort.filter(r => r.host_id === authenticatedUserID);
    const member = roomsToSort.filter(r => r.host_id !== authenticatedUserID);
    const refRating = owned[0]?.content_rating;
    if (refRating && RATING_ORDER.includes(refRating)) {
      const refIdx = RATING_ORDER.indexOf(refRating);
      member.sort((a, b) =>
        Math.abs(RATING_ORDER.indexOf(a.content_rating || 'G') - refIdx) -
        Math.abs(RATING_ORDER.indexOf(b.content_rating || 'G') - refIdx)
      );
    }
    return [...owned, ...member];
  };

  // Derived — no useState, no useEffect; recomputes only when rooms/sessions/searchTerm change
  const filteredRooms = useMemo(() => {
    if (!searchTerm) return sortRooms(rooms);
    const termLower = searchTerm.toLowerCase().trim();
    return sortRooms(rooms.filter(room =>
      (room.name && room.name.toLowerCase().includes(termLower)) ||
      (room.description && room.description.toLowerCase().includes(termLower))
    ));
  }, [rooms, searchTerm]);

  const filteredSessions = useMemo(() => {
    if (!searchTerm) return sessions;
    const termLower = searchTerm.toLowerCase().trim();
    return sessions.filter(session =>
      (session.room_name && session.room_name.toLowerCase().includes(termLower)) ||
      (session.host_username && session.host_username.toLowerCase().includes(termLower))
    );
  }, [sessions, searchTerm]);

  // ✅ Infinite scroll observer for rooms
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Load more when sentinel is visible and we have more rooms to load
        if (entries[0].isIntersecting && hasMoreRooms && !loadingMoreRooms && activeTab === 'rooms') {
          fetchRoomsData(roomsPage + 1, true);
        }
      },
      { threshold: 0.1, rootMargin: '100px' } // Trigger 100px before reaching the end
    );

    const currentTarget = roomsObserverTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMoreRooms, loadingMoreRooms, roomsPage, activeTab]);

  // Fetch rooms function (moved outside useEffect so it can be reused)
  // Fetch rooms function with pagination support
  const fetchRoomsData = async (page = 0, append = false, retriesLeft = 1) => {
    // Cancel any in-flight rooms fetch
    if (fetchAbortRef.current.rooms) fetchAbortRef.current.rooms.abort();
    const controller = new AbortController();
    fetchAbortRef.current.rooms = controller;

    // Serve stale cache instantly on first page (non-append) while revalidating
    if (!append && page === 0 && _lobbyCache.rooms && Date.now() - _lobbyCache.roomsTs < CACHE_TTL) {
      setRooms(_lobbyCache.rooms);
    } else if (!append && retriesLeft === 1) {
      setLoading(true);
    } else if (append && retriesLeft === 1) {
      setLoadingMoreRooms(true);
    }
    if (retriesLeft === 1) setError(null);

    try {
      const limit = 20;
      const offset = page * limit;
      const fetchFn = authenticatedUserID ? getRooms : getPublicRooms;
      const data = await fetchFn(limit, offset, { signal: controller.signal });
      
      const roomsList = data.rooms || [];
      
      // Filter logic:
      // 1. Remove temporary rooms (instant watch) - they should only appear in sessions
      // 2. Show all public rooms
      // 3. Show private rooms only if current user is a member
      const filteredForRooms = roomsList.filter(r => {
        // Exclude instant watch rooms
        if (r.is_temporary) return false;
        
        // Show all public rooms
        if (r.is_public) return true;
        
        // For private rooms, check if current user is a member
        if (!r.is_public && authenticatedUserID) {
          // Check if user is in the members array or is the host
          const isMember = r.member_ids?.includes(authenticatedUserID) || r.host_id === authenticatedUserID;
          return isMember;
        }
        
        // Hide private rooms if user not authenticated
        return false;
      });
      
      if (append) {
        setRooms(prevRooms => {
          const existingIds = new Set(prevRooms.map(r => r.id));
          return [...prevRooms, ...filteredForRooms.filter(r => !existingIds.has(r.id))];
        });
      } else {
        if (page === 0) {
          const fp = _roomsFp(filteredForRooms);
          if (fp !== _lobbyCache.roomsFp) {
            // Something changed — update state and cache
            setRooms(filteredForRooms);
            _lobbyCache.rooms = filteredForRooms;
            _lobbyCache.roomsTs = Date.now();
            _lobbyCache.roomsFp = fp;
          } else {
            // Identical to cache — just refresh the timestamp, skip re-render
            _lobbyCache.roomsTs = Date.now();
          }
        } else {
          setRooms(filteredForRooms);
        }
      }

      // Update pagination state
      setHasMoreRooms(data.has_more || false);
      setRoomsPage(page);
      setLoading(false);
      setLoadingMoreRooms(false);

    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;

      if (retriesLeft > 0) {
        console.warn('⚠️ [LobbyPage] Rooms fetch failed, retrying once…', err);
        setTimeout(() => fetchRoomsData(page, append, retriesLeft - 1), 1500);
        return; // keep loading/loadingMore as-is until the retry itself settles
      }

      console.error("❌ [LobbyPage] Error fetching rooms:", err);
      // Never wipe an already-loaded list (cache-instant-paint or a prior
      // successful fetch) just because this attempt failed after retrying —
      // only show the error banner (which replaces the whole list, see the
      // `!loading && !error` render gate below) when there's genuinely
      // nothing already on screen to fall back on.
      if (!append) {
        setRooms(prev => {
          if (prev.length === 0) setError('Failed to load rooms. Please try again later.');
          return prev;
        });
      }
      setLoading(false);
      setLoadingMoreRooms(false);
    }
  };

  // ✅ Fetch active watch sessions
  const fetchSessionsData = async () => {
    if (fetchAbortRef.current.sessions) fetchAbortRef.current.sessions.abort();
    const controller = new AbortController();
    fetchAbortRef.current.sessions = controller;

    // Serve stale cache immediately while revalidating
    if (_lobbyCache.sessions && Date.now() - _lobbyCache.sessionsTs < CACHE_TTL) {
      setSessions(_lobbyCache.sessions);
    } else {
      setSessionsLoading(true);
    }
    try {
      const data = await getActiveSessions(undefined, undefined, { signal: controller.signal });
      
      // Filter logic:
      // 1. Remove orphaned temporary sessions (no active members)
      // 2. Show all public sessions
      // 3. Show private sessions only if current user is a member
      const rawSessions = data.sessions || [];

      const now = Date.now();
      const filtered = rawSessions.filter(s => {
        // Drop orphaned instant sessions: temporary + 0 members + started > 30s ago.
        // The 30s grace window prevents a race where the host member record hasn't
        // been written yet at the time we query right after session_started fires.
        if (s.is_temporary && (s.member_count === 0 || s.member_count === undefined)) {
          const startedAt = s.started_at ? new Date(s.started_at).getTime() : 0;
          if (now - startedAt > 30_000) return false;
        }

        // Show all public sessions
        if (s.is_public) return true;

        // For private sessions, check if current user is a member.
        // API returns is_member: bool (not member_ids array) — check that first.
        if (!s.is_public && authenticatedUserID) {
          const isMember = s.is_member || s.member_ids?.includes(authenticatedUserID) || s.host_id === authenticatedUserID;
          return isMember;
        }

        // Hide private sessions if user not authenticated
        return false;
      });

      
      const fp = _sessionsFp(filtered);
      if (fp !== _lobbyCache.sessionsFp) {
        setSessions(filtered);
        _lobbyCache.sessions = filtered;
        _lobbyCache.sessionsTs = Date.now();
        _lobbyCache.sessionsFp = fp;
      } else {
        _lobbyCache.sessionsTs = Date.now();
      }

      // Sync sessionsPage.data so cards render immediately (badge and cards share same source).
      // Never prune sessions the current user is hosting or is a member of — their session may
      // score below the top-10 cutoff (e.g. solo session, no preview) and would otherwise
      // disappear from the feed every time fetchSessionsData re-runs on WS reconnect.
      setSessionsPage(prev => {
        if (prev.data.length === 0) return { ...prev, data: filtered };
        // If the API returned nothing, preserve existing cards — a transient empty result
        // (heartbeat gap, momentary network glitch, WS-reconnect re-fetch race) must not
        // wipe the feed. Real session removals are handled by the session_ended WS message.
        if (filtered.length === 0) return prev;
        const filteredMap = new Map(filtered.map(s => [s.session_id, s]));
        // Use the FRESH object from this fetch whenever the session reappeared in it;
        // only fall back to the stale object for the user's own hosted/member session
        // when it didn't come back at all this time (scored below limit cutoff etc.)
        const pruned = prev.data
          .filter(s => filteredMap.has(s.session_id) || s.host_id === authenticatedUserID || s.is_member === true)
          .map(s => filteredMap.get(s.session_id) || s);
        const prunedIds = new Set(pruned.map(s => s.session_id));
        const newSessions = filtered.filter(s => !prunedIds.has(s.session_id));
        const merged = [...newSessions, ...pruned];
        const fpOf = (arr) => arr.map(s => `${s.session_id}:${s.poster_url || ''}:${s.preview_url || ''}:${s.member_count ?? ''}`).join('|');
        if (fpOf(merged) === fpOf(prev.data)) return prev;
        return { ...prev, data: merged };
      });
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
      console.error('❌ [LobbyPage] Error fetching active sessions:', err);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  // ✅ Fetch status feed (stories)
  const fetchStatusFeed = async () => {
    try {
      const data = await getStatusFeed();
      setStatusFeed(data.feed || []);
    } catch {}
  };

  // ✅ Fetch friends list for chat — stale-while-revalidate from _lobbyCache.
  // Retries once on failure (network blip, WS-reconnect contention right after
  // leaving a room, etc.) since this is the ONLY thing that ever repopulates
  // friendsList after a fresh mount — a single failed attempt with no retry
  // previously meant an empty Friends tab for the rest of the session.
  const fetchFriendsList = async (retriesLeft = 1) => {
    // Serve cache instantly so the chat tab feels immediate
    if (_lobbyCache.friends && Date.now() - _lobbyCache.friendsTs < CACHE_TTL) {
      setFriendsList(_lobbyCache.friends);
    } else if (retriesLeft === 1) {
      // Only show the loading state on the first attempt — a silent retry
      // shouldn't flicker the UI back into a loading state.
      setChatsLoading(true);
    }
    try {
      const response = await apiClient.get('/api/friendships/list');
      const normalizedFriends = (response.data.friends || []).map(friend => ({
        ...friend,
        id: friend.id || friend.ID
      }));
      const fp = _friendsFp(normalizedFriends);
      if (fp !== _lobbyCache.friendsFp) {
        setFriendsList(normalizedFriends);
        _lobbyCache.friends   = normalizedFriends;
        _lobbyCache.friendsFp = fp;
      }
      _lobbyCache.friendsTs = Date.now();

      // Seed lastMessagePreviews from the last_message fields returned by the API
      // so previews appear in the friends list without opening each chat first.
      const previews = {};
      normalizedFriends.forEach(friend => {
        if (friend.last_message_at) {
          previews[friend.id] = {
            text: (friend.last_message_type === 'text' || friend.last_message_type === 'system_call')
              ? friend.last_message
              : `[${friend.last_message_type || 'message'}]`,
            timestamp: friend.last_message_at,
            isOwn: !!friend.last_message_own,
          };
        }
      });
      if (Object.keys(previews).length > 0) {
        setLastMessagePreviews(prev => ({ ...prev, ...previews }));
      }
      setChatsLoading(false);
    } catch (err) {
      const isCanceled = err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError';
      if (retriesLeft > 0 && !isCanceled) {
        console.warn('⚠️ [Lobby] Friends list fetch failed, retrying once…', err);
        setTimeout(() => fetchFriendsList(retriesLeft - 1), 1500);
        return; // keep chatsLoading as-is until the retry itself settles
      }
      console.error('❌ [Lobby] Failed to fetch friends list:', err);
      setChatsLoading(false);
    }
  };
  
  // ✅ Fetch pending friend requests (received)
  const fetchPendingRequests = async () => {
    try {
      const response = await apiClient.get('/api/friendships/requests/pending');
      setPendingRequests(response.data.requests || []);
    } catch (err) {
      console.error('❌ [Lobby] Failed to fetch pending requests:', err);
    }
  };
  
  // Fetch community events (scheduled + requests) for the feed carousel.
  // Pass force=true to bypass the has_new gate (e.g. when user explicitly opens the view).
  const fetchCommunityEvents = async (force = false) => {
    try {
      const since = force ? undefined : (localStorage.getItem('communityEventsLastSeen') || undefined);
      const data = await getCommunityEvents(since);
      // Always populate so peekaboo + snap-scroll slot always reflect current events.
      // has_new only controls whether we refresh the "last seen" badge timestamp.
      setCommunityEventsData({
        scheduledEvents: data.scheduled_events || [],
        requests: data.requests || [],
      });
      if (force || data.has_new || !since) {
        localStorage.setItem('communityEventsLastSeen', new Date().toISOString());
      }
    } catch (err) {
      // Non-critical — fail silently
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const data = await getRoomsLeaderboard();
      setLeaderboardData(data.rooms || []);
    } catch (err) {
      // Non-critical — fail silently
    }
  };

  const fetchVsBattleLeaderboard = async () => {
    try {
      const { getVsBattleLeaderboard } = await import('../services/api');
      const data = await getVsBattleLeaderboard();
      setVsBattleLeaderboardData(data.players || []);
    } catch (err) {
      // Non-critical — fail silently
    }
  };

  // ✅ STEP 1: Pre-fetch first 10 sessions + trailers on lobby mount (background)
  const prefetchWatchingNowContent = async () => {
    try {
      // Import the new API functions
      const { getActiveSessions: getActiveSessionsPaginated, getScheduledEventsWithTrailers } = await import('../services/api');
      
      // Fetch sessions with previews (paginated)
      const sessionsData = await getActiveSessionsPaginated(10, 0);
      
      // Fetch trailers (upcoming events with trailer_url)
      const trailersData = await getScheduledEventsWithTrailers(10, 0);
      
      setSessionsPage({
        data: sessionsData.sessions || [],
        offset: 10,
        hasMore: sessionsData.has_more || false,
        loading: false
      });
      
      setTrailersPage({
        data: trailersData.events || [],
        offset: 10,
        hasMore: trailersData.has_more || false,
        loading: false
      });
      
    } catch (err) {
      console.error('❌ [Lobby] Pre-fetch failed:', err);
    }
  };
  
  // 🎯 Fetch feed ads (for live sessions feed)
  const fetchFeedAds = async () => {
    if (fetchingFeedAds || !currentUser) return;
    
    setFetchingFeedAds(true);
    try {
      const userAge = currentUser.date_of_birth ? calculateAge(currentUser.date_of_birth) : 0;
      
      // Fetch banner ads for live sessions feed injection
      const response = await apiClient.get('/api/ads/in-session', {
        params: {
          user_id: currentUser.id,
          session_id: 'feed', // Special session_id for feed ads
          ad_type: 'banner',
          placement: 'feed', // Uses feed_ads setting
          user_age: userAge
        }
      });
      
      if (response.data.ad) {
        setFeedAds([response.data.ad]);
      } else {
        setFeedAds([]);
      }
    } catch (err) {
      console.error('❌ [Lobby] Failed to fetch feed ads:', err);
    } finally {
      setFetchingFeedAds(false);
    }
  };
  
  // Fetch feed ads when lobby loads
  useEffect(() => {
    if (currentUser && activeTab === 'watching') {
      fetchFeedAds();
    }
  }, [currentUser, activeTab]);

  // Fetch upcoming events when drawer opens
  useEffect(() => {
    if (!showCalendarDrawer || !currentUser) return;
    setCalendarLoading(true);
    apiClient.get('/api/user/upcoming-events')
      .then(res => setCalendarEvents(res.data.events || []))
      .catch(err => console.error('Failed to fetch upcoming events:', err))
      .finally(() => setCalendarLoading(false));
  }, [showCalendarDrawer, currentUser]);
  
  // ✅ STEP 3: Load next batch of sessions (infinite scroll)
  const loadMoreSessions = async () => {
    if (sessionsPage.loading || !sessionsPage.hasMore) return;
    
    setSessionsPage(prev => ({ ...prev, loading: true }));
    
    try {
      const { getActiveSessions: getActiveSessionsPaginated } = await import('../services/api');
      const data = await getActiveSessionsPaginated(10, sessionsPage.offset);
      
      setSessionsPage(prev => {
        // ✅ Deduplicate sessions by session_id
        const existingIds = new Set(prev.data.map(s => s.session_id));
        const newSessions = (data.sessions || []).filter(s => !existingIds.has(s.session_id));
        
        return {
          data: [...prev.data, ...newSessions],
          offset: prev.offset + 10,
          hasMore: data.has_more || false,
          loading: false
        };
      });
      
    } catch (err) {
      console.error('❌ [Lobby] Load more sessions failed:', err);
      setSessionsPage(prev => ({ ...prev, loading: false }));
    }
  };
  
  // ✅ STEP 3: Load next batch of trailers (infinite scroll)
  const loadMoreTrailers = async () => {
    if (trailersPage.loading || !trailersPage.hasMore) return;
    
    setTrailersPage(prev => ({ ...prev, loading: true }));
    
    try {
      const { getScheduledEventsWithTrailers } = await import('../services/api');
      const data = await getScheduledEventsWithTrailers(10, trailersPage.offset);
      
      setTrailersPage(prev => ({
        data: [...prev.data, ...(data.events || [])],
        offset: prev.offset + 10,
        hasMore: data.has_more || false,
        loading: false
      }));
      
    } catch (err) {
      console.error('❌ [Lobby] Load more trailers failed:', err);
      setTrailersPage(prev => ({ ...prev, loading: false }));
    }
  };
  
  // ✅ Refresh "Watching Now" content - resets list and fetches fresh data
  const handleRefreshWatchingNow = async () => {
    setIsRefreshingWatchingNow(true);
    
    // Reset both sessions and trailers to initial state
    setSessionsPage({ data: [], offset: 0, hasMore: true, loading: false });
    setTrailersPage({ data: [], offset: 0, hasMore: true, loading: false });
    
    try {
      // Fetch fresh sessions (first 10)
      const { getActiveSessions } = await import('../services/api');
      const sessionsData = await getActiveSessions(10, 0);
      
      setSessionsPage({
        data: sessionsData.sessions || [],
        offset: 10,
        hasMore: sessionsData.has_more || false,
        loading: false
      });
      
      // Fetch fresh trailers (first 10)
      const { getScheduledEventsWithTrailers } = await import('../services/api');
      const trailersData = await getScheduledEventsWithTrailers(10, 0);
      
      setTrailersPage({
        data: trailersData.events || [],
        offset: 10,
        hasMore: trailersData.has_more || false,
        loading: false
      });
      
      toast.success('WatchOut refreshed!');
    } catch (err) {
      console.error('❌ [LobbyPage] Failed to refresh Watching Now:', err);
      toast.error('Failed to refresh content');
    } finally {
      setIsRefreshingWatchingNow(false);
    }
  };
  
  // ✅ Fetch sent friend requests (outgoing)
  const fetchSentRequests = async () => {
    try {
      const response = await getSentFriendRequests();
      setSentRequests(response.data.requests || []);
    } catch (err) {
      console.error('❌ [Lobby] Failed to fetch sent requests:', err);
    }
  };
  
  // ✅ Accept friend request
  const handleAcceptRequest = async (requesterId) => {
    try {
      await apiClient.post(`/api/friendships/accept/${requesterId}`);
      toast.success('Friend request accepted!');
      await fetchPendingRequests();
      await fetchSentRequests();
      await fetchFriendsList();
    } catch (err) {
      console.error('Failed to accept request:', err);
      toast.error('Failed to accept friend request');
    }
  };
  
  // ✅ Reject friend request
  const handleRejectRequest = async (requesterId) => {
    try {
      await apiClient.post(`/api/friendships/reject/${requesterId}`);
      toast.success('Friend request rejected');
      await fetchPendingRequests();
      await fetchSentRequests();
    } catch (err) {
      console.error('Failed to reject request:', err);
      toast.error('Failed to reject friend request');
    }
  };
  
  // ✅ Remove friend (unfriend)
  const handleRemoveFriend = async (friendId) => {
    if (!confirm('Are you sure you want to unfriend this user?')) return;
    
    try {
      await apiClient.delete(`/api/friendships/remove/${friendId}`);
      toast.success('Friend removed');
      
      // Close chat if it's open with this friend
      if (selectedChatUser?.id === friendId) {
        setSelectedChatUser(null);
        setChatMessages(prev => ({ ...prev, [friendId]: [] }));
      }
      
      // Refresh friends list
      await fetchFriendsList();
    } catch (err) {
      console.error('Failed to remove friend:', err);
      toast.error('Failed to remove friend');
    }
  };
  
  // ✅ Block user
  const handleBlockUser = async (userId) => {
    if (!confirm('Are you sure you want to block this user? You will no longer see messages from them.')) return;
    
    try {
      await apiClient.post(`/api/lobby-chats/block/${userId}`);
      toast.success('User blocked');
      
      // Close chat if it's open with this user
      if (selectedChatUser?.id === userId) {
        setSelectedChatUser(null);
        setChatMessages(prev => ({ ...prev, [userId]: [] }));
      }
      
      // Refresh friends list
      await fetchFriendsList();
    } catch (err) {
      console.error('Failed to block user:', err);
      toast.error('Failed to block user');
    }
  };
  
  // ✅ Fetch chat messages with a specific user
  const fetchChatMessages = async (userId) => {
    // Handle both lowercase and uppercase ID
    const actualUserId = userId?.id || userId?.ID || userId;
    if (!actualUserId) {
      console.error('Invalid userId:', userId);
      return;
    }

    // Serve cache instantly so the conversation appears before the API responds
    const cached = _lobbyCache.dms.get(actualUserId);
    if (cached?.length) {
      setChatMessages(prev => ({ ...prev, [actualUserId]: cached }));
    }

    try {
      const response = await apiClient.get(`/api/lobby-chats/messages/${actualUserId}`);
      const messages = response.data.messages || [];

      // Update cache (last 30 messages per conversation)
      _lobbyCache.dms.set(actualUserId, messages.slice(-30));

      setChatMessages(prev => ({
        ...prev,
        [actualUserId]: messages
      }));
      
      // ✅ Save last message preview
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        setLastMessagePreviews(prev => ({
          ...prev,
          [actualUserId]: {
            text: (lastMsg.message_type === 'text' || lastMsg.message_type === 'system_call') ? lastMsg.message : `[${lastMsg.message_type}]`,
            timestamp: lastMsg.created_at,
            isOwn: lastMsg.sender_id === currentUser?.id
          }
        }));
      }
      
      // Clear unread count when opening chat
      setUnreadCounts(prev => ({ ...prev, [actualUserId]: 0 }));
      scrollToBottomChat();
    } catch (err) {
      console.error('Failed to fetch chat messages:', err);
      // Initialize empty message array for new friendships
      if (err.response?.status === 400 || err.response?.status === 404) {
        setChatMessages(prev => ({
          ...prev,
          [actualUserId]: []
        }));
      } else {
        toast.error('Failed to load messages');
      }
    }
  };
  
  // ✅ Fetch rooms with active sessions for WatchOut button
  const fetchLiveRooms = async () => {
    try {
      const resp = await apiClient.get('/api/rooms/with-active-sessions');
      setLiveRooms(resp.data.rooms || []);
    } catch {
      // Silently ignore — not critical
    }
  };

  // Immediate liveRooms fetch when entering chats tab; 20s refresh is handled
  // by the stable fallback poll below so this effect only fires once per tab entry.
  useEffect(() => {
    if (activeTab === 'chats') fetchLiveRooms();
  }, [activeTab]);

  // Safety net: if the Friends tab is opened and somehow ended up empty (the
  // one mount-time fetch failed/raced and had no cache to fall back on), try
  // again. fetchFriendsList's own cache check keeps this a no-op whenever the
  // list is already populated/fresh, so this is cheap to call liberally.
  useEffect(() => {
    if (activeTab === 'chats' && friendsList.length === 0) {
      fetchFriendsList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Same safety net for the Rooms tab — covers the same "the one background
  // fetch failed/raced and there's no cache to fall back on" gap.
  useEffect(() => {
    if (activeTab === 'rooms' && rooms.length === 0) {
      fetchRoomsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Refresh rooms + friends whenever the tab/window regains focus — covers
  // "left the tab open in the background for a while" the same way the
  // mount-time fetch covers "came back from a room". Cheap either way:
  // fetchFriendsList/fetchRoomsData both no-op their network call whenever
  // their own cache is still fresh.
  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (currentUser) {
        fetchFriendsList();
        fetchRoomsData();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Reset the windowed chat-list reveal count whenever the Friends tab is
  // (re-)entered or the search term changes, so it always starts back at the
  // first page instead of staying expanded from a previous scroll session.
  useEffect(() => {
    setVisibleChatItemCount(CHAT_LIST_PAGE_SIZE);
  }, [activeTab, activeRequestsTab, friendsSearchTerm]);

  // Tab hint text: show briefly, then fade
  useEffect(() => {
    setShowTabHint(true);
    const t = setTimeout(() => setShowTabHint(false), 3000);
    return () => clearTimeout(t);
  }, [activeTab, watchingSubTab]);

  // Back button closes open DM / group chat instead of leaving the app
  useEffect(() => {
    if (chatView === 'friends') return;
    const handlePopState = () => handleBackToFriends();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [chatView]);

  // Debounced user search for "Add Friend"
  useEffect(() => {
    if (addFriendQuery.trim().length < 2) {
      setAddFriendResults([]);
      return;
    }
    setAddFriendLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchUsers(addFriendQuery.trim());
        setAddFriendResults(data.users || []);
      } catch {
        setAddFriendResults([]);
      } finally {
        setAddFriendLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [addFriendQuery]);

  // ✅ Send lobby chat message — optimistic UI: append immediately, confirm in background
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !selectedChatUser) return;

    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg = {
      id: optimisticId,
      message: newChatMessage,
      sender_id: currentUser.id,
      recipient_id: selectedChatUser.id,
      created_at: new Date().toISOString(),
      reply_to_id: replyingTo?.id || null,
      message_type: 'text',
      _pending: true,
    };

    // Show immediately — user sees message without waiting for network
    setChatMessages(prev => ({
      ...prev,
      [selectedChatUser.id]: [...(prev[selectedChatUser.id] || []), optimisticMsg],
    }));
    setLastMessagePreviews(prev => ({
      ...prev,
      [selectedChatUser.id]: { text: newChatMessage, timestamp: optimisticMsg.created_at, isOwn: true },
    }));
    setNewChatMessage('');
    setReplyingTo(null);
    scrollToBottomChat();

    const payload = { recipient_id: selectedChatUser.id, message: optimisticMsg.message };
    if (optimisticMsg.reply_to_id) payload.reply_to_id = optimisticMsg.reply_to_id;

    try {
      const response = await apiClient.post('/api/lobby-chats/send', payload);
      // Replace optimistic entry with confirmed server response
      setChatMessages(prev => ({
        ...prev,
        [selectedChatUser.id]: (prev[selectedChatUser.id] || []).map(m =>
          m.id === optimisticId ? response.data : m
        ),
      }));
    } catch (err) {
      console.error('Failed to send message:', err);
      // Mark as failed so user can see it didn't go through
      setChatMessages(prev => ({
        ...prev,
        [selectedChatUser.id]: (prev[selectedChatUser.id] || []).map(m =>
          m.id === optimisticId ? { ...m, _failed: true } : m
        ),
      }));
      toast.error('Message failed to send — tap to retry');
    }
  };
  
  // ✅ Handle opening chat with a user
  const handleOpenChat = (user) => {
    const userId = user?.id || user?.ID;
    if (!user || !userId) {
      console.error('Invalid user object:', user);
      toast.error('Unable to open chat');
      return;
    }
    // Normalize user object to use lowercase id
    const normalizedUser = {
      ...user,
      id: userId
    };
    setSelectedChatUser(normalizedUser);
    setChatView('messages'); // ✅ Switch to messages view
    fetchChatMessages(userId);
    // Push a history entry so the browser back button closes the chat
    window.history.pushState({ wewatch: true, chatView: 'messages', userId }, '');
  };

  // ✅ Handle back to friends list
  const handleBackToFriends = () => {
    setChatView('friends');
    setSelectedChatUser(null);
    setSelectedGroup(null);
  };

  // ── Group chat functions ──────────────────────────────────────

  const fetchGroupsList = async () => {
    try {
      const data = await getLobbyGroups();
      const groups = data.groups || [];
      setGroupsList(groups);
      const counts = {};
      groups.forEach(g => { counts[g.id] = g.unread_count || 0; });
      setGroupUnreadCounts(counts);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    }
  };

  // Keeps the currently-open group's header in sync with groupsList — fixes
  // a real gap where a rename/icon change by ANOTHER member (WS-triggered
  // fetchGroupsList()) updated groupsList but never touched selectedGroup,
  // so the open header silently never reflected the edit.
  useEffect(() => {
    if (!selectedGroup) return;
    const fresh = groupsList.find(g => g.id === selectedGroup.id);
    if (fresh && fresh !== selectedGroup) setSelectedGroup(fresh);
  }, [groupsList, selectedGroup]);

  // Applied immediately by the editor's own LobbyGroupInfoModal mutation, so
  // the header/list update without waiting on the WS round-trip (the WS
  // handler above still re-fetches for every OTHER connected member).
  const handleGroupUpdated = (patchedGroup) => {
    setSelectedGroup(patchedGroup);
    setGroupsList(prev => prev.map(g => g.id === patchedGroup.id ? { ...g, ...patchedGroup } : g));
  };

  const handleOpenGroup = async (group) => {
    setSelectedGroup(group);
    setChatView('group_messages');
    setGroupMenuOpen(false);
    // Push a history entry so the browser back button closes the group chat
    window.history.pushState({ wewatch: true, chatView: 'group_messages', groupId: group.id }, '');
    try {
      const data = await getLobbyGroupMessages(group.id);
      setGroupMessages(prev => ({ ...prev, [group.id]: data.messages || [] }));
      setGroupUnreadCounts(prev => ({ ...prev, [group.id]: 0 }));
    } catch (err) {
      console.error('Failed to fetch group messages:', err);
      setGroupMessages(prev => ({ ...prev, [group.id]: [] }));
    }
    setTimeout(() => chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleSendGroupMessage = async (e) => {
    e.preventDefault();
    if (!newGroupChatMessage.trim() || !selectedGroup) return;
    const msg = newGroupChatMessage.trim();
    setNewGroupChatMessage('');
    try {
      const data = await sendLobbyGroupMessage(selectedGroup.id, msg);
      setGroupMessages(prev => ({
        ...prev,
        [selectedGroup.id]: [...(prev[selectedGroup.id] || []), data],
      }));
      setTimeout(() => chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      console.error('Failed to send group message:', err);
      toast.error('Failed to send message');
    }
  };

  const handleGroupAttachment = async (fileType, file) => {
    if (!selectedGroup) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const uploaders = {
        image: uploadLobbyGroupImage,
        video: uploadLobbyGroupVideo,
        document: uploadLobbyGroupDocument,
        voice_note: uploadLobbyGroupVoiceNote,
      };
      const data = await uploaders[fileType](selectedGroup.id, formData);
      setGroupMessages(prev => ({
        ...prev,
        [selectedGroup.id]: [...(prev[selectedGroup.id] || []), data],
      }));
      scrollToBottomChat();
      toast.success('File sent!');
    } catch (err) {
      console.error('Failed to send group attachment:', err);
      throw err;
    }
  };

  const handleGroupWatchOut = async (roomId) => {
    if (!selectedGroup) return;
    try {
      await sendLobbyGroupWatchOut(selectedGroup.id, roomId);
      toast.success('Watch-out sent to group!');
      setShowWatchOutModal(false);
      const data = await getLobbyGroupMessages(selectedGroup.id);
      setGroupMessages(prev => ({ ...prev, [selectedGroup.id]: data.messages || [] }));
    } catch (err) {
      toast.error('Failed to send watch-out');
    }
  };

  const handleStartGroupCall = async () => {
    if (!selectedGroup) return;
    try {
      const data = await startLobbyGroupCall(selectedGroup.id);
      const livekitRoom = new Room();
      await livekitRoom.connect(data.livekit_url, data.token);
      setActiveGroupCall({ groupId: selectedGroup.id, groupName: selectedGroup.name, token: data.token, roomName: data.room_name, livekitUrl: data.livekit_url });
      setGroupCallRoom(livekitRoom);
      toast.success(`Group call started`);
    } catch (err) {
      console.error('Failed to start group call:', err);
      toast.error('Failed to start group call');
    }
  };

  const handleJoinGroupCall = async (groupId, roomName, livekitUrl, groupName) => {
    try {
      const data = await startLobbyGroupCall(groupId);
      const livekitRoom = new Room();
      await livekitRoom.connect(data.livekit_url, data.token);
      setActiveGroupCall({ groupId, groupName, token: data.token, roomName: data.room_name, livekitUrl: data.livekit_url });
      setGroupCallRoom(livekitRoom);
      setIncomingGroupCall(null);
    } catch (err) {
      console.error('Failed to join group call:', err);
      toast.error('Failed to join group call');
    }
  };

  const handleEndGroupCall = async () => {
    if (!activeGroupCall) return;
    try {
      if (groupCallRoom) {
        groupCallRoom.disconnect();
        setGroupCallRoom(null);
      }
      await endLobbyGroupCall(activeGroupCall.groupId);
      setActiveGroupCall(null);
    } catch (err) {
      console.error('Failed to end group call:', err);
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedGroup) return;
    const groupId = selectedGroup.id;
    const groupName = selectedGroup.name;
    try {
      await leaveLobbyGroup(groupId);
      toast.success(`Left "${groupName}"`);
      setGroupMenuOpen(false);
      handleBackToFriends();
      setGroupsList(prev => prev.filter(g => g.id !== groupId));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to leave group');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    const groupId = selectedGroup.id;
    const groupName = selectedGroup.name;
    try {
      await deleteLobbyGroup(groupId);
      toast.success(`"${groupName}" deleted`);
      setGroupMenuOpen(false);
      handleBackToFriends();
      setGroupsList(prev => prev.filter(g => g.id !== groupId));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete group');
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembersForGroup.length === 0) {
      toast.error('Enter a group name and add at least one member');
      return;
    }
    try {
      await createLobbyGroup(newGroupName.trim(), selectedMembersForGroup);
      toast.success('Group created!');
      setShowCreateGroupModal(false);
      setNewGroupName('');
      setSelectedMembersForGroup([]);
      await fetchGroupsList();
    } catch (err) {
      console.error('Failed to create group:', err);
      toast.error('Failed to create group');
    }
  };

  // ✅ NEW: Handle file attachment upload
  const handleSendAttachment = async (fileType, file, recipientId) => {
    const formData = new FormData();
    formData.append('recipient_id', recipientId);
    
    if (fileType === 'voice_note') {
      formData.append('audio', file);
      formData.append('duration', recordingDuration);
    } else {
      formData.append('file', file);
    }

    try {
      const endpoint = {
        image: '/api/lobby-chats/image',
        video: '/api/lobby-chats/video',
        document: '/api/lobby-chats/document',
        voice_note: '/api/lobby-chats/voice-note'
      }[fileType];

      const response = await apiClient.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Add message to local state
      setChatMessages(prev => ({
        ...prev,
        [recipientId]: [...(prev[recipientId] || []), response.data]
      }));

      scrollToBottomChat();
      toast.success('File sent!');
    } catch (err) {
      console.error('Failed to send attachment:', err);
      throw err;
    }
  };

  // ✅ NEW: Handle sticker send
  const handleSendSticker = async (stickerUrl, provider, stickerId, recipientId) => {
    try {
      const response = await apiClient.post('/api/lobby-chats/sticker', {
        recipient_id: recipientId,
        sticker_url: stickerUrl,
        provider: provider,
        sticker_id: stickerId
      });

      // Add message to local state
      setChatMessages(prev => ({
        ...prev,
        [recipientId]: [...(prev[recipientId] || []), response.data]
      }));

      scrollToBottomChat();
      toast.success('Sticker sent!');
    } catch (err) {
      console.error('Failed to send sticker:', err);
      throw err;
    }
  };

  // ✅ NEW: Handle poll creation
  const handleSendPoll = async (pollData, recipientId) => {
    try {
      const response = await apiClient.post('/api/lobby-chats/poll', {
        recipient_id: recipientId,
        ...pollData
      });

      // Add message to local state
      setChatMessages(prev => ({
        ...prev,
        [recipientId]: [...(prev[recipientId] || []), response.data]
      }));

      scrollToBottomChat();
      toast.success('Poll created!');
    } catch (err) {
      console.error('Failed to create poll:', err);
      throw err;
    }
  };

  // ✅ NEW: Handle poll voting
  const handleVotePoll = async (messageId, optionIndex) => {
    try {
      const response = await apiClient.post(`/api/lobby-chats/poll/${messageId}/vote`, {
        option_index: optionIndex
      });

      // Update message in local state
      setChatMessages(prev => {
        const userId = selectedChatUser.id;
        const messages = prev[userId] || [];
        return {
          ...prev,
          [userId]: messages.map(msg => 
            msg.id === messageId ? response.data : msg
          )
        };
      });

      toast.success('Vote recorded!');
    } catch (err) {
      console.error('Failed to vote:', err);
      toast.error('Failed to vote on poll');
    }
  };

  // ✅ NEW: Handle message edit
  const handleEditMessage = async (messageId, newText) => {
    try {
      const response = await apiClient.patch(`/api/lobby-chats/${messageId}`, {
        message: newText
      });

      // Update message in local state
      setChatMessages(prev => {
        const userId = selectedChatUser.id;
        const messages = prev[userId] || [];
        return {
          ...prev,
          [userId]: messages.map(msg => 
            msg.id === messageId ? response.data : msg
          )
        };
      });

      toast.success('Message edited');
    } catch (err) {
      console.error('Failed to edit message:', err);
      toast.error('Failed to edit message');
    }
  };

  // ✅ NEW: Handle message delete
  const handleDeleteMessage = async (messageId) => {
    try {
      await apiClient.delete(`/api/lobby-chats/${messageId}`);

      // Remove message from local state (or mark as deleted)
      setChatMessages(prev => {
        const userId = selectedChatUser.id;
        const messages = prev[userId] || [];
        return {
          ...prev,
          [userId]: messages.filter(msg => msg.id !== messageId)
        };
      });

      toast.success('Message deleted');
    } catch (err) {
      console.error('Failed to delete message:', err);
      toast.error('Failed to delete message');
    }
  };

  // ✅ NEW: Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'voice-note.webm', { type: 'audio/webm' });
        
        // Send voice note
        await handleSendAttachment('voice_note', audioFile, selectedChatUser.id);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        setRecordingDuration(0);
      };
      
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      
      // Start timer
      let seconds = 0;
      recordingTimerRef.current = setInterval(() => {
        seconds++;
        setRecordingDuration(seconds);
        
        // Auto-stop at 60 seconds
        if (seconds >= 60) {
          stopRecording();
        }
      }, 1000);
      
      toast.success('Recording started');
    } catch (err) {
      console.error('Failed to start recording:', err);
      toast.error('Microphone access denied');
    }
  };

  // ✅ NEW: Stop voice recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  // ✅ NEW: Cancel voice recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      
      toast('Recording cancelled', { icon: '🚫' });
    }
  };

  // ✅ Circle of Friends handlers
  const handleCircleAddMember = (friend) => {
    setCircleOfFriendsIds(prev => {
      if (prev.includes(friend.id)) return prev;
      const next = [...prev, friend.id];
      localStorage.setItem('circleOfFriends', JSON.stringify(next));
      return next;
    });
  };

  const handleCircleRemoveMember = (userId) => {
    setCircleOfFriendsIds(prev => {
      const next = prev.filter(id => id !== userId);
      localStorage.setItem('circleOfFriends', JSON.stringify(next));
      return next;
    });
  };

  const handleCircleWatchOut = async (memberIds) => {
    if (!memberIds.length) return;
    setShowCircleSphere(false);
    try {
      const data = await startCircleWatchout(memberIds, 'video', 'G');
      navigate(`/rooms/${data.room_id}`, { state: { openSession: true } });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start Circle WatchOut';
      toast.error(msg);
    }
  };

  const handleCircleGroupChat = async (members) => {
    if (!members.length) return;
    setShowCircleSphere(false);
    const label = localStorage.getItem('circleGroupLabel') || 'My Inner Circle';
    try {
      await createLobbyGroup(label, members.map(m => m.id));
      await fetchGroupsList();
      setActiveTab('chats');
      toast.success('Group created!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    }
  };

  const handleCircleChat = (friend) => {
    setActiveTab('chats');
    // Find friend in chats list and open
    const chatFriend = friendsList.find(f => f.id === friend.id) || friend;
    // Small delay to let tab switch render
    setTimeout(() => {
      if (chatFriend) {
        setSelectedChatUser(chatFriend);
      }
    }, 50);
  };

  // ✅ Call Functions
  const initiateCall = async (user) => {
    if (!user || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Cannot initiate call - not connected');
      return;
    }

    // Check if already in a call
    if (activeCall || outgoingCall || incomingCall) {
      toast.error('Already in a call');
      return;
    }

    console.log('📞 [Call] Initiating call to:', user.username);
    
    // Show outgoing call modal
    setOutgoingCall({ user, status: 'calling' });

    // Send call initiate message
    wsRef.current.send(JSON.stringify({
      type: 'call_initiate',
      data: {
        to_user_id: user.id,
      }
    }));

    // Set 60-second timeout
    callTimeoutRef.current = setTimeout(() => {
      console.log('📞 [Call] Timeout - no answer');
      setOutgoingCall(prev => ({ ...prev, status: 'no_answer' }));
      
      // Send cancel message to backend
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'call_cancel',
          data: {
            to_user_id: user.id,
          }
        }));
      }

      setTimeout(() => {
        setOutgoingCall(null);
      }, 2000);
    }, 60000);
  };

  const handleIncomingCall = (message) => {
    // Check priority: lower user ID wins
    if (outgoingCall) {
      const myId = authenticatedUserID;
      const otherId = message.from_user_id;
      
      if (myId < otherId) {
        // My call has priority, auto-decline incoming
        console.log('📞 [Call] Priority conflict - declining incoming call (my priority)');
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'call_decline',
            data: {
              to_user_id: otherId,
            }
          }));
        }
        return;
      } else {
        // Incoming call has priority, cancel my outgoing call
        console.log('📞 [Call] Priority conflict - canceling my outgoing call (their priority)');
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
        }
        setOutgoingCall(null);
        
        // Send cancel to my outgoing call recipient
        if (outgoingCall && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'call_cancel',
            data: {
              to_user_id: outgoingCall.user.id,
            }
          }));
        }
      }
    }

    // Show incoming call modal
    setIncomingCall({
      user: message.from_user,
      callId: message.call_id,
    });
  };

  const acceptCall = async () => {
    if (!incomingCall || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    console.log('📞 [Call] Accepting call from:', incomingCall.user.username);

    // Send accept message
    wsRef.current.send(JSON.stringify({
      type: 'call_accept',
      data: {
        to_user_id: incomingCall.user.id,
        call_id: incomingCall.callId,
      }
    }));

    // Backend will respond with call_accepted including LiveKit token
  };

  const declineCall = () => {
    if (!incomingCall || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    console.log('📞 [Call] Declining call from:', incomingCall.user.username);

    wsRef.current.send(JSON.stringify({
      type: 'call_decline',
      data: {
        to_user_id: incomingCall.user.id,
        call_id: incomingCall.callId,
      }
    }));

    setIncomingCall(null);
  };

  const handleCallAccepted = async (message) => {
    console.log('📞 [Call] Call accepted, joining LiveKit room:', message.room_name);

    // Clear outgoing call modal
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
    }
    setOutgoingCall(null);
    setIncomingCall(null);

    // Create LiveKit room and join
    try {
      const room = new Room();
      
      await room.connect(message.livekit_url, message.token, {
        audio: true,
        video: false,
      });

      console.log('📞 [Call] Connected to LiveKit room');

      // Enable local audio
      await room.localParticipant.setMicrophoneEnabled(true);

      setCallRoom(room);
      setActiveCall({
        user: outgoingCall?.user || incomingCall?.user || message.other_user,
        room,
        roomName: message.room_name,
      });

      // Listen for disconnections
      room.on(RoomEvent.Disconnected, () => {
        console.log('📞 [Call] Disconnected from LiveKit');
        handleEndCall();
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('📞 [Call] Participant left:', participant.identity);
        toast('Call ended');
        handleEndCall();
      });

    } catch (error) {
      console.error('❌ [Call] Failed to join LiveKit room:', error);
      toast.error('Failed to join call');
      handleEndCall();
    }
  };

  const handleEndCall = () => {
    console.log('📞 [Call] Ending call');

    // Disconnect from LiveKit
    if (callRoom) {
      callRoom.disconnect();
      setCallRoom(null);
    }

    // Notify backend
    if (activeCall && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_end',
        data: {
          to_user_id: activeCall.user.id,
        }
      }));
    }

    // Clear all call states
    setActiveCall(null);
    setOutgoingCall(null);
    setIncomingCall(null);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
    }
  };

  const cancelOutgoingCall = () => {
    if (!outgoingCall) return;

    console.log('📞 [Call] Canceling outgoing call');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_cancel',
        data: {
          to_user_id: outgoingCall.user.id,
        }
      }));
    }

    setOutgoingCall(null);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
    }
  };

  // ✅ Fullscreen Watching Now Handlers
  const handleOpenFullscreen = (index) => {
    setFullscreenSessionIndex(index);
    setIsWatchingNowFullscreen(true);
    document.body.style.overflow = 'hidden'; // Prevent body scroll
  };

  const handleCloseFullscreen = () => {
    setIsWatchingNowFullscreen(false);
    document.body.style.overflow = 'auto'; // Restore body scroll
  };

  // ✅ ESC key listener for fullscreen exit
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isWatchingNowFullscreen) {
        handleCloseFullscreen();
      }
    };

    if (isWatchingNowFullscreen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isWatchingNowFullscreen]);

  // Fetch notifications on mount
  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/api/notifications?limit=30');
      setNotifications(res.data.notifications || []);
      setUnreadNotifCount(res.data.unread_count || 0);
    } catch (e) {
      // notifications are non-critical
    }
  };

  const fetchUpcomingEventsCount = async () => {
    try {
      const res = await apiClient.get('/api/user/upcoming-events');
      setUpcomingEventsCount((res.data.events || []).length);
    } catch (e) {}
  };

  const markAllNotifsRead = async () => {
    try {
      await apiClient.patch('/api/notifications/read-all');
      setUnreadNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {}
  };

  const handleClearAllNotifications = async () => {
    try {
      await clearAllNotifications();
      setNotifications([]);
      setUnreadNotifCount(0);
    } catch (e) {}
  };

  const handleNotificationClick = (n) => {
    setShowNotifPanel(false);
    if (!n.is_read) {
      apiClient.patch(`/api/notifications/${n.id}/read`).catch(() => {});
      setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, is_read: true } : notif));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    }
    const nType = n.notif_type || n.type;
    const roomTypes = ['room_post', 'session_started', 'session_ended', 'event_booking', 'event_booking_confirm', 'gift_ticket', 'watch_invite'];
    const postTypes = ['post_like', 'post_comment', 'reply'];
    if (roomTypes.includes(nType)) {
      navigate(`/rooms/${n.entity_id}`);
    } else if (postTypes.includes(nType)) {
      // entity_id is a post ID for all three types (post_like, post_comment,
      // and reply — the latter fixed backend-side to point at the post
      // rather than the parent comment) — open the actual post instead of
      // just landing on a tab. 'watching'/'discover' below used to be the
      // right target back when Feed was a sub-tab of "watching"; Feed is now
      // its own top-level tab, so that combo silently went nowhere near it.
      setActiveTab('feed');
      apiClient.get(`/api/posts/${n.entity_id}`)
        .then(res => {
          setSelectedPost(res.data.post);
          setIsPostViewModalOpen(true);
        })
        .catch(() => toast.error('Failed to load post'));
    } else if (nType === 'dm_received' || nType === 'missed_call') {
      setActiveTab('chats');
      const friend = friendsList.find(f => (f.id || f.ID) === n.entity_id);
      if (friend) handleOpenChat(friend);
    } else if (nType === 'token_gift') {
      navigate('/payment');
    }
  };

  // Initial fetch on mount — tiered by priority so critical data loads first.
  // Tier 1 (immediate): what the user sees first + what WS routing needs
  // Tier 2 (300ms): secondary UI data
  // Tier 3 (700ms): background / decorative data
  useEffect(() => {
    if (!currentUser) return;

    // Tier 1 — critical path
    fetchSessionsData();
    fetchFriendsList();

    // Tier 2 — important but not blocking
    const t2 = setTimeout(() => {
      fetchPendingRequests();
      fetchSentRequests();
      fetchNotifications();
      fetchGroupsList();
    }, 300);

    // Tier 3 — background / low priority
    const t3 = setTimeout(() => {
      fetchRoomsData();
      fetchStatusFeed();
      fetchCommunityEvents();
      fetchLeaderboard();
      fetchVsBattleLeaderboard();
      fetchUpcomingEventsCount();
      prefetchWatchingNowContent();
    }, 700);

    return () => { clearTimeout(t2); clearTimeout(t3); };
  }, [currentUser]);

  // Guests: fetch community events only (sessions handled by guest effect below)
  useEffect(() => {
    if (currentUser) return;
    fetchCommunityEvents();
  }, []);

  // Onboarding: open UserProfileModal once for any user who hasn't completed it
  // Gate on authLoading so we never fire during the brief null-user window on page load
  useEffect(() => {
    if (authLoading || !currentUser?.id) return;
    const key = `wewatch_onboarding_done_${currentUser.id}`;
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => setIsUserProfileModalOpen(true), 700);
      return () => clearTimeout(timer);
    }
  }, [authLoading, currentUser?.id]);

  // Guest mode: fetch public sessions + show banner + 30s refresh
  useEffect(() => {
    if (currentUser) return;

    const loadPublicSessions = () => {
      getPublicLiveSessions().then(data => {
        const sessions = (data.sessions || []).map(s => ({ ...s, is_member: false }));
        setSessionsPage({ data: sessions, offset: sessions.length, hasMore: false, loading: false });
      }).catch(() => {});
    };

    loadPublicSessions();
    const interval = setInterval(loadPublicSessions, 30000);

    let bannerTimer;
    if (!guestBannerDismissed) {
      bannerTimer = setTimeout(() => setShowGuestBanner(true), 800);
    }

    return () => {
      clearInterval(interval);
      clearTimeout(bannerTimer);
    };
  }, []);

  // Auto-dismiss guest banner after 5 seconds
  useEffect(() => {
    if (!showGuestBanner) return;
    const t = setTimeout(() => setShowGuestBanner(false), 5000);
    return () => clearTimeout(t);
  }, [showGuestBanner]);

  // Community events tune — plays while the calendar drawer view OR the feed card is active
  useEffect(() => {
    if (!showCommunityEventsView && !communityCardVisible) {
      if (communityEventsTuneRef.current) {
        communityEventsTuneRef.current.pause();
        communityEventsTuneRef.current.currentTime = 0;
      }
      return;
    }
    const tracks = [
      '/sounds/music/track1.opus',
      '/sounds/music/track2.opus',
      '/sounds/music/track3.opus',
      '/sounds/music/track4.opus',
      '/sounds/music/track5.opus',
    ].sort(() => Math.random() - 0.5);

    let cancelled = false;
    let current = null;

    const playTrack = (idx) => {
      if (cancelled) return;
      current = new Audio(tracks[idx % tracks.length]);
      current.volume = 0.35;
      current.addEventListener('ended', () => playTrack(idx + 1));
      communityEventsTuneRef.current = current;
      current.play().catch(() => {});
    };

    playTrack(0);

    return () => {
      cancelled = true;
      current?.pause();
      communityEventsTuneRef.current = null;
    };
  }, [showCommunityEventsView, communityCardVisible]);

  // Ringtone: plays while waiting (outgoing or incoming), stops when call connects/ends
  useEffect(() => {
    const isRinging = !!(outgoingCall || incomingCall);
    if (!isRinging) return;

    let stopped = false;
    let loopTimeout;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const ringBurst = (startTime, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.01);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.28);
      gain.gain.linearRampToValueAtTime(0, startTime + 0.32);
      osc.start(startTime);
      osc.stop(startTime + 0.33);
    };

    const scheduleRingCycle = (baseTime) => {
      if (stopped) return;
      // Two-tone ring: 400 Hz + 450 Hz, two bursts then ~2 s silence = 3 s total
      ringBurst(baseTime,       400); ringBurst(baseTime,       450);
      ringBurst(baseTime + 0.4, 400); ringBurst(baseTime + 0.4, 450);
      loopTimeout = setTimeout(() => scheduleRingCycle(ctx.currentTime), 3000);
    };

    scheduleRingCycle(ctx.currentTime);
    callRingtoneRef.current = ctx;

    return () => {
      stopped = true;
      clearTimeout(loopTimeout);
      try { ctx.close(); } catch (_) {}
      callRingtoneRef.current = null;
    };
  }, [!!outgoingCall, !!incomingCall]);

  // ✅ STEP 4: Infinite scroll - Intersection Observer for load trigger
  useEffect(() => {
    if (!loadMoreTriggerRef.current || activeTab !== 'watching') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreSessions();
          loadMoreTrailers();
        }
      },
      { threshold: 0.1, rootMargin: '200px' } // Trigger 200px before bottom
    );
    
    observer.observe(loadMoreTriggerRef.current);
    
    return () => observer.disconnect();
  }, [activeTab, sessionsPage.hasMore, trailersPage.hasMore, sessionsPage.loading, trailersPage.loading]);



  // WebSocket connection for real-time lobby updates
  useEffect(() => {
    if (!wsToken) {
      setWsConnected(false);
      return;
    }

    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let paused = false;
    let pendingReconnect = false;

    const scheduleReconnect = () => {
      if (paused) { pendingReconnect = true; return; }
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
      reconnectTimer = setTimeout(connectWebSocket, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        paused = true;
      } else {
        paused = false;
        const wsGone = !wsRef.current || wsRef.current.readyState > 1;
        if (pendingReconnect || wsGone) {
          pendingReconnect = false;
          reconnectAttempts = 0;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          connectWebSocket();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const connectWebSocket = () => {
      try {
        // ✅ FIX: Use API backend URL (Railway/localhost) instead of window.location (Vercel)
        const apiBaseUrl = API_BASE_URL;
        const apiUrl = new URL(apiBaseUrl);
        const protocol = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
        const host = apiUrl.hostname;
        const port = apiUrl.port ? `:${apiUrl.port}` : '';
        
        // Build WebSocket URL using backend domain (Railway in production, localhost in dev)
        const wsUrl = `${protocol}://${host}${port}/api/lobby/ws?token=${encodeURIComponent(wsToken)}`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setWsConnected(true);
          reconnectAttempts = 0;
          console.log('✅ [LobbyPage WS] Connected');
          // Re-fetch sessions on every connect/reconnect so any session_started
          // events missed during a WS gap are picked up immediately.
          fetchSessionsData();
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            // Handle lobby broadcasts
            switch (message.type) {
              case 'lobby_connected':
                break;
                
              case 'room_created':
              case 'room_deleted':
              case 'event_created':
              case 'event_deleted':
              case 'event_updated':
                fetchRoomsData();
                break;
                
              case 'session_started':
                // Debounced — collapses bursts (e.g. multiple sessions starting at reconnect)
                if (sessionsFetchDebounceRef.current) clearTimeout(sessionsFetchDebounceRef.current);
                sessionsFetchDebounceRef.current = setTimeout(fetchSessionsData, 300);
                // Light up the room card immediately without waiting for a full rooms refetch
                if (message.room_id) {
                  setRooms(prev => prev.map(r =>
                    r.id === message.room_id ? { ...r, is_active_session: true } : r
                  ));
                  // Patch liveRooms inline so WatchOut tab updates without waiting for poll
                  if (message.host_id) {
                    setLiveRooms(prev => {
                      const alreadyIn = prev.some(r => r.room_id === message.room_id);
                      if (alreadyIn) return prev;
                      return [...prev, {
                        room_id:       message.room_id,
                        room_name:     message.room_name  || '',
                        room_type:     message.room_type  || '',
                        watch_type:    message.watch_type || '',
                        session_title: message.session_title || '',
                        is_private:    message.is_private || false,
                        session_id:    message.session_id || '',
                        host_id:       message.host_id,
                        watching_count: 0,
                      }];
                    });
                  }
                }
                break;

              case 'room_session_started':
                // Targeted alert: a room you're a member of just went live — share the debounce
                if (sessionsFetchDebounceRef.current) clearTimeout(sessionsFetchDebounceRef.current);
                sessionsFetchDebounceRef.current = setTimeout(fetchSessionsData, 300);
                if (message.room_name && message.host_username) {
                  toast(`🔴 ${message.room_name} is now live!`, {
                    duration: 6000,
                    icon: '📺',
                    style: { background: '#1e1b4b', color: '#fff', border: '1px solid #7c3aed' },
                  });
                }
                break;

              case 'notification_new':
                // Increment badge and prepend to list
                setUnreadNotifCount(prev => prev + 1);
                if (message.data) {
                  setNotifications(prev => [{ ...message.data, is_read: false }, ...prev]);
                }
                break;
                
              case 'session_ended':
                if (message.session_id) {
                  // Remove from sessions state
                  setSessions(prev => prev.filter(s => s.session_id !== message.session_id));

                  // Remove from sessionsPage data (infinite scroll)
                  setSessionsPage(prev => ({
                    ...prev,
                    data: prev.data.filter(s => s.session_id !== message.session_id)
                  }));

                  // Clear preview data
                  setSessionPreviews(prev => {
                    const updated = { ...prev };
                    delete updated[message.session_id];
                    return updated;
                  });

                  // Clear likes and chat counts
                  setSessionLikes(prev => {
                    const updated = { ...prev };
                    delete updated[message.session_id];
                    return updated;
                  });

                  setSessionChatCounts(prev => {
                    const updated = { ...prev };
                    delete updated[message.session_id];
                    return updated;
                  });
                } else {
                  // Fallback: refresh if session_id not provided
                  fetchSessionsData();
                }
                // Remove from liveRooms so WatchOut button hides and stale invite cards update
                if (message.room_id) {
                  setLiveRooms(prev => prev.filter(r => r.room_id !== message.room_id));
                  // Clear the red pulse ring on the room card immediately
                  setRooms(prev => prev.map(r =>
                    r.id === message.room_id ? { ...r, is_active_session: false } : r
                  ));
                }
                // Track ended session_id so private WatchOut DM cards grey out immediately
                if (message.session_id) {
                  setEndedSessionIds(prev => new Set([...prev, message.session_id]));
                }
                break;
                
              case 'friend_request_received':
                fetchPendingRequests();
                fetchFriendsList();
                toast.success(`${message.from_username} sent you a friend request!`);
                break;

              case 'friend_request_accepted':
                fetchFriendsList();
                fetchPendingRequests();
                fetchSentRequests();
                toast.success(`${message.from_username} accepted your friend request!`);
                break;
                
              case 'call_incoming':
                // Incoming call from another user
                console.log('📞 [Call] Raw incoming call message:', message);
                console.log('📞 [Call] Incoming call from:', message.data?.from_user);
                console.log('📞 [Call] Call ID:', message.data?.call_id);
                handleIncomingCall(message.data);
                break;
                
              case 'call_accepted':
                // Call was accepted, join LiveKit room
                console.log('📞 [Call] Call accepted:', message);
                handleCallAccepted(message.data || message);
                break;
                
              case 'call_declined':
                // Call was declined
                console.log('📞 [Call] Call declined');
                if (outgoingCallRef.current) {
                  setOutgoingCall(prev => ({ ...prev, status: 'declined' }));
                  if (callTimeoutRef.current) {
                    clearTimeout(callTimeoutRef.current);
                  }
                  setTimeout(() => {
                    setOutgoingCall(null);
                  }, 2000);
                }
                break;

              case 'call_busy':
                // User is already in a call
                console.log('📞 [Call] User is busy');
                if (outgoingCallRef.current) {
                  setOutgoingCall(prev => ({ ...prev, status: 'busy' }));
                  if (callTimeoutRef.current) {
                    clearTimeout(callTimeoutRef.current);
                  }
                  setTimeout(() => {
                    setOutgoingCall(null);
                  }, 2000);
                }
                break;
                
              case 'call_ended':
                // Call ended by other user
                console.log('📞 [Call] Call ended by remote user');
                handleEndCall();
                break;
                
              case 'session_preview_updated':
                if (message.session_id) {
                  if (!message.poster_url && !message.preview_url) {
                    // `final: true` means nothing further is coming (e.g. a game just
                    // ended, or any other "media genuinely stopped" case) — no async
                    // generation is in flight, so show the emoji placeholder right
                    // away instead of a spinner that nothing will ever resolve.
                    // Without this flag, it's the normal "about to generate a real
                    // preview shortly" clear (uploads), which does warrant a spinner.
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: null,
                        previewUrl: null,
                        isGenerating: !message.final,
                        isClearing: !!message.final,
                      }
                    }));
                  } else if (message.poster_url && !message.preview_url) {
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: resolvePreviewUrl(message.poster_url),
                        // Preserve existing previewUrl and version — poster broadcast must not
                        // overwrite a clip that already arrived or clear the previewVersion key.
                        previewUrl: prev[message.session_id]?.previewUrl || null,
                        version: prev[message.session_id]?.version,
                        isGenerating: false,
                        isClearing: false,
                      }
                    }));
                  } else {
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: resolvePreviewUrl(message.poster_url),
                        previewUrl: resolvePreviewUrl(message.preview_url),
                        isGenerating: false,
                        isClearing: false,
                        version: Date.now(),
                      }
                    }));
                  }
                  // Merge liveshare metadata into the session card so podcast title/logo
                  // and liveshare_mode appear without waiting for a full sessions refetch.
                  // Use || so empty-string values from the broadcast don't erase existing data.
                  if (message.liveshare_mode || message.podcast_title || message.podcast_logo_url) {
                    setSessionsPage(prev => ({
                      ...prev,
                      data: prev.data.map(s =>
                        s.session_id === message.session_id
                          ? {
                              ...s,
                              liveshare_mode:   message.liveshare_mode   || s.liveshare_mode,
                              podcast_title:    message.podcast_title    || s.podcast_title,
                              podcast_logo_url: message.podcast_logo_url || s.podcast_logo_url,
                            }
                          : s
                      ),
                    }));
                  }
                }
                break;
                
              case 'session_meta_updated':
                // Fired by liveshare_mode_selected handler immediately — no DB read dependency.
                if (message.session_id && (message.liveshare_mode || message.podcast_title || message.podcast_logo_url)) {
                  setSessionsPage(prev => ({
                    ...prev,
                    data: prev.data.map(s =>
                      s.session_id === message.session_id
                        ? {
                            ...s,
                            liveshare_mode:   message.liveshare_mode   || s.liveshare_mode,
                            podcast_title:    message.podcast_title    || s.podcast_title,
                            podcast_logo_url: message.podcast_logo_url || s.podcast_logo_url,
                          }
                        : s
                    ),
                  }));
                }
                break;

              case 'media_state_changed':
                // ✅ Update sessionsPage with new media state (avoid duplicates)
                setSessionsPage(prev => {
                  const exists = prev.data.some(s => s.session_id === message.session_id);
                  
                  if (exists) {
                    // Update existing session
                    return {
                      ...prev,
                      data: prev.data.map(s => 
                        s.session_id === message.session_id
                          ? { ...s, ...message.data }
                          : s
                      )
                    };
                  } else {
                    setTimeout(() => fetchSessionsData(), 100);
                    return prev;
                  }
                });
                
                // ✅ Backend automatically generates preview and broadcasts session_preview_updated
                // No need to manually trigger - just wait for the WebSocket event
                break;
                
              case 'room_rating_updated':
                // Update rooms list
                setRooms(prevRooms => 
                  prevRooms.map(room => 
                    room.id === message.room_id 
                      ? { 
                          ...room, 
                          average_rating: message.average_rating, 
                          total_ratings: message.total_ratings 
                        }
                      : room
                  )
                );
                
                // Update sessions list (if session belongs to this room)
                setSessions(prevSessions =>
                  prevSessions.map(session =>
                    session.room_id === message.room_id
                      ? { 
                          ...session, 
                          average_rating: message.average_rating,
                        }
                      : session
                  )
                );
                break;
                
              case 'session_liked':
                setSessionLikes(prev => ({
                  ...prev,
                  [message.session_id]: {
                    ...prev[message.session_id],
                    count: message.likes_count
                  }
                }));
                break;
                
              case 'session_unliked':
                setSessionLikes(prev => ({
                  ...prev,
                  [message.session_id]: {
                    ...prev[message.session_id],
                    count: message.likes_count
                  }
                }));
                break;
                
              case 'session_chat_sent':
                // Only update if chat is NOT open (open chat updates from polling)
                if (activeChatSessionRef.current?.session_id !== message.session_id) {
                  setSessionChatCounts(prev => ({
                    ...prev,
                    [message.session_id]: message.chat_count
                  }));
                }
                break;
                
              case 'rating_updated':
                break;

              case 'discover_post_created':
                // New public post published — refresh discover feed for all viewers
                if (discoverFeedRef.current?.refresh) {
                  discoverFeedRef.current.refresh();
                }
                break;

              case 'lobby_chat': {
                // Real-time message — DM or group
                const chatData = message.data || message;
                if (chatData.group_id) {
                  // Append to open group chat
                  const gid = chatData.group_id;
                  setGroupMessages(prev => {
                    const existing = prev[gid] || [];
                    // Avoid duplicates (own messages already appended optimistically)
                    if (existing.some(m => m.id === chatData.id)) return prev;
                    return { ...prev, [gid]: [...existing, chatData] };
                  });
                  // Increment unread badge if group is not currently open
                  setSelectedGroup(sg => {
                    if (!sg || sg.id !== gid) {
                      setGroupUnreadCounts(prev => ({ ...prev, [gid]: (prev[gid] || 0) + 1 }));
                    }
                    return sg;
                  });
                } else {
                  // DM message — append to open DM if it's the right user
                  const dmSenderId = chatData.sender_id;
                  const dmRecipientId = chatData.recipient_id;
                  setChatMessages(prev => {
                    const otherUserId = dmSenderId === currentUser?.id ? dmRecipientId : dmSenderId;
                    const existing = prev[otherUserId] || [];
                    // Already confirmed (API response arrived first)
                    if (existing.some(m => m.id === chatData.id)) return prev;
                    // WS arrived before API response — replace the pending optimistic placeholder
                    const pendingIdx = existing.findIndex(m =>
                      m._pending && m.sender_id === chatData.sender_id && m.message === chatData.message
                    );
                    let next;
                    if (pendingIdx !== -1) {
                      next = [...existing];
                      next[pendingIdx] = chatData;
                    } else {
                      next = [...existing, chatData];
                    }
                    // Keep cache in sync so re-opening the chat is instant
                    _lobbyCache.dms.set(otherUserId, next.slice(-30));
                    return { ...prev, [otherUserId]: next };
                  });
                  // Badge increment for closed chats
                  setSelectedChatUser(scu => {
                    if (!scu || scu.id !== dmSenderId) {
                      if (dmSenderId !== currentUser?.id) {
                        setUnreadCounts(prev => ({ ...prev, [dmSenderId]: (prev[dmSenderId] || 0) + 1 }));
                      }
                    }
                    return scu;
                  });
                  // Always update last message preview so friend list stays current
                  const otherUserId = dmSenderId === currentUser?.id ? dmRecipientId : dmSenderId;
                  setLastMessagePreviews(prev => ({
                    ...prev,
                    [otherUserId]: {
                      text: (chatData.message_type === 'text' || chatData.message_type === 'system_call') ? chatData.message : `[${chatData.message_type}]`,
                      timestamp: chatData.created_at,
                      isOwn: dmSenderId === currentUser?.id,
                    }
                  }));
                }
                break;
              }

              case 'group_call_incoming':
                setIncomingGroupCall(message.data || message);
                toast(`📞 Group Call in ${(message.data || message).group_name}`, {
                  duration: 15000,
                  icon: '👥',
                });
                break;

              case 'group_call_ended':
                if (activeGroupCallRef.current && activeGroupCallRef.current.groupId === (message.data || message).group_id) {
                  handleEndGroupCall();
                }
                setIncomingGroupCall(null);
                break;

              case 'group_created':
              case 'group_member_added':
              case 'group_renamed':
              case 'group_icon_updated':
                fetchGroupsList();
                break;

              case 'group_deleted': {
                const deletedGroupId = (message.data || message).group_id;
                setGroupsList(prev => prev.filter(g => g.id !== deletedGroupId));
                setGroupMessages(prev => { const next = { ...prev }; delete next[deletedGroupId]; return next; });
                setGroupUnreadCounts(prev => { const next = { ...prev }; delete next[deletedGroupId]; return next; });
                if (selectedGroup?.id === deletedGroupId) {
                  toast(`Group "${(message.data || message).group_name}" was deleted`);
                  handleBackToFriends();
                }
                break;
              }

              default:
                break;
            }
          } catch (err) {
            console.error('❌ [LobbyPage WS] Failed to parse message:', err);
          }
        };
        
        ws.onclose = (event) => {
          setWsConnected(false);
          if (event.code !== 1000) scheduleReconnect();
        };
        
        ws.onerror = () => {
          if (reconnectAttempts <= 1) console.warn('⚠️ [LobbyPage WS] Connection error — will retry');
        };
        
        wsRef.current = ws;
      } catch (error) {
        console.error('❌ [LobbyPage WS] Connection exception:', error.message);
        scheduleReconnect();
      }
    };

    connectWebSocket();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close(1000, 'Component unmounting');
    };
  }, [wsToken]); // Re-run when wsToken becomes available

  // Stable fallback poll — single interval for the component lifetime.
  // Reads wsConnected + activeTab via refs so the interval never restarts on
  // state changes, closing the gap that existed with [wsConnected] deps.
  const wsConnectedRef = React.useRef(wsConnected);
  const activeTabRef   = React.useRef(activeTab);
  useEffect(() => { wsConnectedRef.current = wsConnected; }, [wsConnected]);
  useEffect(() => { activeTabRef.current   = activeTab;   }, [activeTab]);
  // Keep stale-closure refs in sync so onmessage always reads current values
  useEffect(() => { outgoingCallRef.current      = outgoingCall;      }, [outgoingCall]);
  useEffect(() => { activeGroupCallRef.current   = activeGroupCall;   }, [activeGroupCall]);
  useEffect(() => { activeChatSessionRef.current = activeChatSession; }, [activeChatSession]);

  useEffect(() => {
    const interval = setInterval(() => {
      // fetchSessionsData runs UNCONDITIONALLY — not just when WS is down. A WS
      // connection that's "up" can still have missed a one-off broadcast (e.g. it
      // finished connecting a few seconds after the broadcast already fired — a
      // startup race, not a "WS down" scenario) and will stay "up" indefinitely
      // afterward, so gating this on wsConnectedRef left exactly that case with no
      // way to ever self-correct. This is what feeds sessionsPage.data, which in
      // turn drives the posterChanged/previewChanged sync effect below.
      fetchSessionsData();
      if (!wsConnectedRef.current) {
        // WS is down — also poll rooms/notifications/friends at 20s so those
        // appear quickly even without a live connection.
        fetchRoomsData();
        fetchNotifications();
        fetchFriendsList();
      }
      if (activeTabRef.current === 'chats') {
        fetchLiveRooms();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, []); // stable for component lifetime — never restarts

  // Handle search change
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Handle search submit
  const handleSearchSubmit = (event) => {
    event.preventDefault();
  };

  // ✅ Handle direct join from session preview
  const handleJoinSessionDirect = async (session) => {
    if (!currentUser) { setShowAuthSheet(true); return; }
    try {
      // 1. Verify session still exists (for temporary rooms)
      if (session.is_temporary) {
        const { exists } = await verifySessionExists(session.session_id);
        if (!exists) {
          toast.error('This watch session has ended');
          await fetchSessionsData(); // Refresh list
          return;
        }
      }
      
      // 2. Check if ticketing required
      if (session.ticketing_enabled && session.ticket_price_tokens > 0) {
        try {
          const response = await apiClient.get(`/api/sessions/${session.session_id}/tickets/me`);
          
          if (!response.data.has_ticket) {
            setSelectedSessionForTicket(session);
            setIsTicketModalOpen(true);
            return; // Stop here - modal will handle the rest
          }
        } catch (error) {
          console.error('Failed to check ticket status:', error);
          toast.error('Failed to verify access. Please try again.');
          return;
        }
      }
      
      // 3. All checks passed - join session directly
      const destination = session.watch_type === '3d_cinema' 
        ? `/cinema-3d-demo/${session.room_id}?session_id=${session.session_id}`
        : `/watch/${session.room_id}?session_id=${session.session_id}`;
      
      toast.success('Joining session...', { duration: 1000 });
      navigate(destination, {
        state: {
          sessionId: session.session_id,
          currentUser,
          showLoadingOverlay: true
        }
      });
      
    } catch (error) {
      console.error('Failed to join session:', error);
      toast.error('Failed to join session. Please try again.');
    }
  };

  // ✅ Handle ticket purchase success
  const handleTicketPurchaseSuccess = (sessionId) => {
    // Close the modal
    setIsTicketModalOpen(false);
    
    // Find the session we just bought a ticket for
    const session = sessions.find(s => s.session_id === sessionId) || 
                    sessionsPage.data.find(s => s.session_id === sessionId);
    
    if (!session) {
      toast.error('Session not found. Please try again.');
      return;
    }
    
    // Navigate directly to watch interface
    const destination = session.watch_type === '3d_cinema' 
      ? `/cinema/${session.session_id}`
      : `/watch/${session.session_id}`;
    
    toast.success('🎟️ Ticket purchased! Joining session...', { duration: 1500 });
    
    // Small delay for user feedback, then navigate
    setTimeout(() => {
      navigate(destination);
    }, 800);
    
    // Clear selection
    setSelectedSessionForTicket(null);
  };

  // ✅ Handle session card click — navigates directly into the session for all types
  const handleSessionCardClick = async (session) => {
    const { exists } = await verifySessionExists(session.session_id);

    if (!exists) {
      toast.error('This watch session has ended', { duration: 3000, icon: '⏹️' });
      await fetchSessionsData();
      return;
    }

    const { room_id, session_id, watch_type, class_type } = session;

    if (watch_type === '3d_cinema') {
      navigate(`/cinema-3d-demo/${room_id}?session_id=${session_id}`, {
        state: { sessionId: session_id, currentUser, showLoadingOverlay: true }
      });
    } else if (watch_type === 'classroom') {
      const route = class_type === 'lecture_hall' ? 'lecture-hall' : 'classroom';
      navigate(`/classroom/${route}/${room_id}?session_id=${session_id}`, {
        state: { sessionId: session_id, currentUser, showLoadingOverlay: true, classType: class_type }
      });
    } else {
      navigate(`/watch/${room_id}?session_id=${session_id}`, {
        state: { sessionId: session_id, currentUser, showLoadingOverlay: true }
      });
    }
  };

  // Handle create room — show explainer once, then navigate directly on repeat visits
  const handleCreateRoom = () => {
    const seen = localStorage.getItem('wewatch_room_explainer_seen');
    if (!seen) {
      setIsRoomExplainerOpen(true);
    } else {
      navigate('/rooms/create');
    }
  };

  const handleRoomExplainerProceed = () => {
    localStorage.setItem('wewatch_room_explainer_seen', 'true');
    setIsRoomExplainerOpen(false);
    navigate('/rooms/create');
  };

  // Handle share room link
  const handleShareRoom = async (roomId, roomName, roomHandle) => {
    const url = buildRoomShareUrl({ id: roomId, handle: roomHandle });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success(`Link for "${roomName}" copied to clipboard!`, { duration: 3000 });
      } else {
        // Fallback for browsers without clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success(`Link for "${roomName}" copied to clipboard!`, { duration: 3000 });
      }
      setOpenMenuRoomId(null);
    } catch (err) {
      console.error('Failed to copy link:', err);
      toast.error('Failed to copy link. Please try again.');
    }
  };

  // Open delete confirmation modal
  const handleOpenDeleteModal = (room) => {
    setRoomToDelete(room);
    setOpenMenuRoomId(null);
  };

  // Handle room deletion
  const handleRoomDelete = async (roomId) => {
    if (!window.confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await deleteRoom(roomId);
      setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
    } catch (err) {
      console.error('Error deleting room:', err);
      setError('Failed to delete room. Please try again.');
      const data = await getRooms();
      setRooms(data.rooms || []);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Handle profile save
  const handleSaveProfile = async (profileData) => {
    try {
      const formData = new FormData();
      formData.append('username', profileData.username);
      formData.append('bio', profileData.bio || '');
      
      if (profileData.avatarFile) {
        formData.append('avatar', profileData.avatarFile);
      }

      const response = await apiClient.put('/api/users/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success('Profile updated successfully!');
      
      // ✅ Refresh user data to show updated profile
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      toast.error('Failed to update profile. Please try again.');
    }
  };

  // ✅ Fetch session like status (isLiked + count)
  const fetchSessionLikes = async (sessionId) => {
    try {
      const response = await apiClient.get(`/api/sessions/${sessionId}/like-status`);
      setSessionLikes(prev => ({
        ...prev,
        [sessionId]: {
          count: response.data.count || 0,
          isLiked: response.data.isLiked || false
        }
      }));
    } catch (err) {
      // Silently handle errors (session might have ended)
      if (err.response?.status !== 404) {
        console.error(`Failed to fetch likes for session ${sessionId}:`, err);
      }
    }
  };

  // ✅ Fetch session chat message count (initial load only)
  const fetchSessionChatCount = async (sessionId) => {
    try {
      const response = await apiClient.get(`/api/sessions/${sessionId}/chat-count`);
      setSessionChatCounts(prev => ({
        ...prev,
        [sessionId]: response.data.count || 0
      }));
    } catch (err) {
      // Silently handle errors (session might have ended)
      if (err.response?.status !== 404) {
        console.error(`Failed to fetch chat count for session ${sessionId}:`, err);
      }
    }
  };

  // Sync sessionPreviews from API data (backend stores preview_url/poster_url after each generation).
  // Runs on every sessionsPage poll so previews appear without needing a live WS connection.
  // Also seeds new sessions with room_avatar_url so the card shows immediately on session start.
  useEffect(() => {
    setSessionPreviews(prev => {
      const updates = {};
      sessionsPage.data.forEach(session => {
        const newPreviewUrl = resolvePreviewUrl(session.preview_url);
        const newPosterUrl = resolvePreviewUrl(session.poster_url) || resolvePreviewUrl(session.room_avatar_url);
        const existing = prev[session.session_id];

        const previewChanged = newPreviewUrl && existing?.previewUrl !== newPreviewUrl;
        // Poster-only changes (e.g. a game starting/ending) never get a preview_url at
        // all, so previewChanged alone misses them entirely — this REST-poll path is
        // the fallback for exactly the case where the WS broadcast was missed (e.g.
        // the lobby's own WS connection wasn't open yet at the moment it fired), so it
        // needs to catch a poster_url change on its own, not just alongside a clip.
        const posterChanged = existing && existing.posterUrl !== (newPosterUrl || null);
        // Seed new sessions that have no entry yet but do have a poster/room avatar
        const needsSeed = !existing && newPosterUrl;

        if (previewChanged || posterChanged || needsSeed) {
          updates[session.session_id] = {
            posterUrl: newPosterUrl || null,
            previewUrl: newPreviewUrl || null,
            isGenerating: false,
            version: newPreviewUrl ? Date.now() : undefined,
          };
        }
      });
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [sessionsPage.data]);
  
  // ✅ Fetch likes and chat counts for all sessions
  useEffect(() => {
    sessionsPage.data.forEach(session => {
      // Only fetch if not already fetched
      if (!sessionLikes[session.session_id]) {
        fetchSessionLikes(session.session_id);
      }
      if (sessionChatCounts[session.session_id] === undefined) {
        fetchSessionChatCount(session.session_id);
      }
    });
  }, [sessionsPage.data]);


  // ── scroll-position memory for feed tabs ──────────────────────────────────
  const saveWatchingScrollPos = () => {
    if (!watchingNowScrollRef.current) return;
    const pos = watchingNowScrollRef.current.scrollTop;
    if (watchingSubTab === 'sessions') sessionsScrollPosRef.current = pos;
    else forYouScrollPosRef.current = pos;
  };

  const restoreWatchingScrollPos = (toSubTab) => {
    requestAnimationFrame(() => {
      if (!watchingNowScrollRef.current) return;
      if (toSubTab === 'sessions') watchingNowScrollRef.current.scrollTop = sessionsScrollPosRef.current;
      else watchingNowScrollRef.current.scrollTop = forYouScrollPosRef.current;
    });
  };

  const switchSubTab = (to) => { saveWatchingScrollPos(); setWatchingSubTab(to); restoreWatchingScrollPos(to); };

  // ── direction-locked swipe for tab switching (all tabs) ──────────────────
  const handleTouchStart = (e) => {
    swipeStateRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, locked: null };
  };
  const handleTouchMove = (e) => {
    if (swipeStateRef.current.locked !== null) return;
    const dx = Math.abs(e.touches[0].clientX - swipeStateRef.current.startX);
    const dy = Math.abs(e.touches[0].clientY - swipeStateRef.current.startY);
    if (Math.sqrt(dx * dx + dy * dy) < 12) return;
    swipeStateRef.current.locked = dx > dy ? 'h' : 'v';
  };
  const handleTouchEnd = (e) => {
    // When the community events snap card is active, let CommunityEventsCard own horizontal swipe
    if (communityCardVisible) return;
    if (swipeStateRef.current.locked !== 'h') return;
    const dx = e.changedTouches[0].clientX - swipeStateRef.current.startX;
    if (Math.abs(dx) < 50) return;
    const tabOrder = ['chats', 'rooms', 'watching', 'feed'];
    const currentIdx = tabOrder.indexOf(activeTab);
    if (dx < 0 && currentIdx < tabOrder.length - 1) setActiveTab(tabOrder[currentIdx + 1]);
    else if (dx > 0 && currentIdx > 0) setActiveTab(tabOrder[currentIdx - 1]);
  };

  // ── Taskbar handlers ──
  const handleCenterFAB = () => {
    if (activeTab === 'watching') {
      setCreateModalHidePosts(true);
      setIsCreateNewModalOpen(true);
    } else if (activeTab === 'feed') {
      setIsPostUploadModalOpen(true);
    } else if (activeTab === 'rooms') {
      if (!currentUser?.main_room_id) {
        handleCreateRoom();
      } else {
        setCreateModalHidePosts(true);
        setIsCreateNewModalOpen(true);
      }
    }
  };

  const handleSearchToggle = () => {
    if (activeTab === 'rooms') setShowRoomsSearch(s => !s);
    else if (activeTab === 'chats') {
      if (showChatsSearch) {
        setFriendsSearchTerm('');
        setAddFriendQuery('');
        setAddFriendResults([]);
      }
      setShowChatsSearch(s => !s);
    } else if (activeTab === 'watching') {
      setShowSessionSearch(s => !s);
    } else if (activeTab === 'feed') {
      setShowDiscoverSearch(s => !s);
    }
  };

  const handleHomeButton = () => {
    if (activeTab === 'chats') {
      setActiveTab('watching');
    } else if (activeTab === 'rooms') {
      fetchRoomsData(0, false);
    } else if (activeTab === 'watching') {
      handleRefreshWatchingNow();
      if (watchingNowScrollRef.current) watchingNowScrollRef.current.scrollTop = 0;
    } else if (activeTab === 'feed') {
      const scrollToTop = () => {
        window.scrollTo({ top: 0 });
      };
      const p = discoverFeedRef.current?.refresh();
      if (p && typeof p.then === 'function') p.then(scrollToTop);
      else scrollToTop();
    }
  };

  const isSearchActive =
    (activeTab === 'rooms' && showRoomsSearch) ||
    (activeTab === 'chats' && showChatsSearch) ||
    (activeTab === 'watching' && showSessionSearch) ||
    (activeTab === 'feed' && showDiscoverSearch);

  const showCenterFAB = true;
  const showSearchButton = true;

  return (
    <div className="relative min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-200 pb-20">

      {/* Guest banner — slides down from top, auto-dismisses after 5s */}
      {!authLoading && !currentUser && (
        <div
          className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-32px)] max-w-sm transition-all duration-500 ease-out ${
            showGuestBanner ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
        >
          <div className="bg-gray-950/95 backdrop-blur-sm border border-white/15 rounded-2xl px-4 py-3 shadow-xl">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-white/75 text-xs font-medium">Browsing as guest</span>
              <button
                onClick={() => { setShowGuestBanner(false); setGuestBannerDismissed(true); }}
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-stretch gap-2">
              <button
                onClick={() => navigate('/register')}
                className="flex-1 flex flex-col items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white py-2.5 px-2 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span className="text-xs font-semibold whitespace-nowrap">Sign Up</span>
              </button>
              <button
                onClick={() => navigate('/login')}
                className="flex-1 flex flex-col items-center gap-1 bg-gray-700/80 hover:bg-gray-600/80 text-white py-2.5 px-2 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="text-xs font-medium whitespace-nowrap">Log In</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soft auth sheet — slides up from bottom, tapping backdrop dismisses */}
      {showAuthSheet && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAuthSheet(false)}
        >
          <div
            className="w-full max-w-md bg-gray-950 border border-white/10 rounded-t-2xl px-5 pt-4 pb-10 shadow-2xl"
            style={{ animation: 'auth-sheet-up 0.26s cubic-bezier(0.32,0.72,0,1) forwards' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <p className="text-white font-bold text-lg text-center mb-1">Sign in to continue</p>
            <p className="text-white/50 text-sm text-center mb-6 leading-relaxed">
              Create a free account to join sessions, save rooms and chat with others
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => navigate('/register')}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white rounded-2xl font-semibold text-sm transition-all"
              >
                Sign Up — it's free
              </button>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3.5 bg-white/8 hover:bg-white/12 active:scale-95 text-white rounded-2xl font-medium text-sm transition-all"
              >
                Log In
              </button>
              <button
                onClick={() => setShowAuthSheet(false)}
                className="text-white/35 hover:text-white/60 text-sm py-2 transition-colors text-center"
              >
                Continue browsing
              </button>
            </div>
          </div>
          <style>{`
            @keyframes auth-sheet-up {
              from { transform: translateY(100%); }
              to   { transform: translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* ✅ Hamburger Menu Button - Fixed Top Left */}
      <button
        onClick={() => setIsLobbyLeftSidebarOpen(true)}
        className="fixed top-3 left-3 z-30 rounded-md shadow-lg transition-colors duration-200 flex items-center justify-center p-0.5 sm:p-1 bg-gray-800/70 hover:bg-gray-700 text-white dark:bg-white dark:hover:bg-gray-100 dark:text-gray-800"
        aria-label="Open menu"
      >
        <Bars3Icon className="h-7 w-7 sm:h-8 sm:w-8" />
      </button>


      {/* 🔔 Notification Panel */}
      {showNotifPanel && (
        <div className="fixed bottom-20 right-4 z-40 w-80 max-h-[28rem] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <span className="font-semibold text-white text-sm">Notifications</span>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAllNotifications}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium"
                >
                  Clear all
                </button>
              )}
              <button onClick={() => setShowNotifPanel(false)} className="text-gray-400 hover:text-white">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No notifications yet</p>
            ) : (
              notifications.map(n => {
                const nType = n.notif_type || n.type;
                // Pick icon + colour per notification type
                let Icon = BellIcon;
                let iconBg = 'bg-gray-700';
                let iconColor = 'text-gray-300';
                if (nType === 'friend_request' || nType === 'friend_accepted') {
                  Icon = UserIcon; iconBg = 'bg-blue-900'; iconColor = 'text-blue-400';
                } else if (nType === 'dm_received') {
                  Icon = ChatBubbleLeftIcon; iconBg = 'bg-purple-900'; iconColor = 'text-purple-400';
                } else if (nType === 'missed_call') {
                  Icon = PhoneIcon; iconBg = 'bg-red-900'; iconColor = 'text-red-400';
                } else if (nType === 'session_started') {
                  Icon = VideoCameraIcon; iconBg = 'bg-green-900'; iconColor = 'text-green-400';
                } else if (nType === 'session_ended') {
                  Icon = VideoCameraIcon; iconBg = 'bg-gray-800'; iconColor = 'text-gray-400';
                } else if (nType === 'room_post') {
                  Icon = FilmIcon; iconBg = 'bg-orange-900'; iconColor = 'text-orange-400';
                } else if (nType === 'post_like') {
                  Icon = HeartIcon; iconBg = 'bg-pink-900'; iconColor = 'text-pink-400';
                } else if (nType === 'post_comment' || nType === 'reply') {
                  Icon = ChatBubbleOvalLeftEllipsisIcon; iconBg = 'bg-sky-900'; iconColor = 'text-sky-400';
                } else if (nType === 'event_booking' || nType === 'event_booking_confirm') {
                  Icon = CalendarDaysIcon; iconBg = 'bg-teal-900'; iconColor = 'text-teal-400';
                } else if (nType === 'watch_invite') {
                  Icon = EyeIcon; iconBg = 'bg-purple-900'; iconColor = 'text-purple-400';
                } else if (nType === 'token_gift') {
                  Icon = HeartIcon; iconBg = 'bg-yellow-900'; iconColor = 'text-yellow-400';
                }
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800/60 transition-colors flex items-start gap-3 ${!n.is_read ? 'bg-gray-800' : ''}`}
                  >
                    {/* Icon bubble */}
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 ${iconBg}`}>
                      <Icon className={`h-4 w-4 ${iconColor}`} />
                    </div>
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-sm font-medium leading-snug ${!n.is_read ? 'text-white' : 'text-gray-300'}`}>{n.title}</p>
                        {!n.is_read && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-purple-500 mt-1" />}
                      </div>
                      {n.body ? <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{n.body}</p> : null}
                      <p className="text-gray-600 text-xs mt-1">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ✅ Left Sidebar */}
      <LobbyLeftSidebar
        isOpen={isLobbyLeftSidebarOpen}
        onClose={() => setIsLobbyLeftSidebarOpen(false)}
        currentUser={currentUser}
        onMyProfileClick={() => {
          setIsLobbyLeftSidebarOpen(false);
          setIsUserProfileModalOpen(true);
        }}
        onSettingsClick={() => {
          setIsLobbyLeftSidebarOpen(false);
          setIsSettingsModalOpen(true);
        }}
        onStatusPrivacy={() => setShowStatusPrivacy(true)}
      />

      {/* ✅ User Profile Modal */}
      <UserProfileModal
        user={currentUser}
        isOpen={isUserProfileModalOpen}
        onClose={() => {
          if (currentUser?.id) {
            localStorage.setItem(`wewatch_onboarding_done_${currentUser.id}`, 'true');
          }
          setIsUserProfileModalOpen(false);
        }}
        isOwnProfile={true}
        onSaveProfile={handleSaveProfile}
      />

      {/* View other user's profile (from chat 3-dot menu) */}
      {chatProfileUser && (
        <UserProfileModal
          user={chatProfileUser}
          isOpen={true}
          onClose={() => setChatProfileUser(null)}
          isOwnProfile={false}
        />
      )}

      {/* ✅ Lobby Group Info Modal */}
      {isGroupInfoModalOpen && selectedGroup && (
        <LobbyGroupInfoModal
          isOpen={isGroupInfoModalOpen}
          onClose={() => setIsGroupInfoModalOpen(false)}
          group={selectedGroup}
          currentUser={currentUser}
          friendsList={friendsList}
          onGroupUpdated={handleGroupUpdated}
        />
      )}

      {/* Expanded group icon (from the friends-list row) */}
      {expandedGroupIcon && (
        <div
          className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4"
          onClick={() => setExpandedGroupIcon(null)}
        >
          <div className="relative">
            <button
              onClick={() => setExpandedGroupIcon(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 text-3xl leading-none"
            >
              ×
            </button>
            <img
              src={expandedGroupIcon.url}
              alt={expandedGroupIcon.name}
              className="max-w-[600px] max-h-[600px] w-auto h-auto object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* ✅ Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onReplayAppTour={() => setIsOnboardingTourOpen(true)}
      />

      <div className="container mx-auto p-4">
        {/* ✅ Toast Notifications */}
        <Toaster position="top-center" />

        {/* ✅ Access Selection Modal */}
        <InstantWatchInfoModal
          isOpen={isInstantWatchInfoModalOpen}
          onClose={() => setIsInstantWatchInfoModalOpen(false)}
          onContinue={handleInstantWatchInfoContinue}
        />
        <AccessModal
          isOpen={isAccessModalOpen}
          onClose={() => setIsAccessModalOpen(false)}
          onSelectAccess={handleAccessSelected}
          title="Choose Room Access"
        />

        {/* ✅ Watch Type Selection Modal */}
        <WatchTypeModal
          isOpen={isWatchTypeModalOpen}
          onClose={() => setIsWatchTypeModalOpen(false)}
          onSelectType={handleWatchTypeSelected}
          title="Choose Your Instant Watch Experience"
          currentUser={currentUser}
        />

        {/* ✅ Class Type Selection Modal (for classroom) */}
        <ClassTypeModal
          isOpen={isClassTypeModalOpen}
          onClose={() => {
            setIsClassTypeModalOpen(false);
            setIsWatchTypeModalOpen(true);
          }}
          onSelectClassType={handleClassTypeSelected}
          currentUser={currentUser}
        />

        {/* Room explainer — shown once before first room creation */}
        {isRoomExplainerOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl animate-slide-up sm:animate-fade-in">
              {/* Top accent */}
              <div className="h-1 w-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-t-2xl" />
              <div className="p-6">
                {/* Icon + title */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">📺</span>
                  </div>
                  <h2 className="text-white text-lg font-bold leading-tight">Your Room is Your Channel</h2>
                </div>

                <p className="text-gray-300 text-sm leading-relaxed mb-3">
                  Think of it as your personal TV channel on LetsWatchOut — you host live watch sessions, your audience joins, and you can even earn from paid tickets.
                </p>
                <p className="text-amber-400 text-xs font-medium mb-4">
                  ⚠️ You can only create 1 room — make it count!
                </p>

                <ul className="space-y-2 mb-6">
                  {[
                    ['🎬', 'Host live watch sessions anytime'],
                    ['👥', 'Build a loyal community of followers'],
                    ['💰', 'Earn tokens from paid sessions'],
                  ].map(([icon, text]) => (
                    <li key={text} className="flex items-center gap-2.5 text-sm text-gray-300">
                      <span className="text-base flex-shrink-0">{icon}</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={handleRoomExplainerProceed}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-sm transition-all mb-2"
                >
                  Create My Room →
                </button>
                <button
                  onClick={() => setIsRoomExplainerOpen(false)}
                  className="w-full py-2 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ✅ Onboarding Tour — one-time, shown right after fresh signup */}
        {isOnboardingTourOpen && (
          <OnboardingTour
            onClose={() => {
              setIsOnboardingTourOpen(false);
              localStorage.removeItem('wewatch_show_onboarding_tour');
              localStorage.setItem('wewatch_tour_seen', '1');
            }}
          />
        )}

        {/* ✅ Create New Modal */}
        <CreateNewModal
          isOpen={isCreateNewModalOpen}
          onClose={() => { setIsCreateNewModalOpen(false); setCreateModalHidePosts(false); }}
          onInstantWatch={handleInstantWatch}
          onCreateRoom={handleCreateRoom}
          onGoToRoom={(roomId) => {
            setIsCreateNewModalOpen(false);
            setCreateModalHidePosts(false);
            navigate(`/rooms/${roomId}`, { state: { openSession: true } });
          }}
          onCreatePost={() => setIsPostUploadModalOpen(true)}
          userMainRoomId={currentUser?.main_room_id}
          userMainRoomName={rooms.find(r => r.id === currentUser?.main_room_id)?.name}
          isSuperAdmin={currentUser?.role === 'super_admin'}
          hidePosts={createModalHidePosts}
        />

        {/* ✅ Post Upload Modal */}
        <PostUploadModal
          isOpen={isPostUploadModalOpen}
          onClose={() => setIsPostUploadModalOpen(false)}
          onSuccess={() => {
            // Switch to discover tab and refresh feed
            setActiveTab('feed');
            setTimeout(() => { if (discoverFeedRef.current?.refresh) discoverFeedRef.current.refresh(); }, 500);
            setIsPostUploadModalOpen(false);
          }}
        />

        {/* Delete Room Modal */}
        <DeleteRoomModal
          isOpen={!!roomToDelete}
          onClose={() => setRoomToDelete(null)}
          onConfirm={handleRoomDelete}
          room={roomToDelete}
        />

        {/* Events Preview Modal */}
        <EventsPreviewModal
          isOpen={isEventsModalOpen}
          onClose={() => {
            setIsEventsModalOpen(false);
            setSelectedRoomForEvents(null);
          }}
          roomId={selectedRoomForEvents?.id}
          roomName={selectedRoomForEvents?.name}
          currentUser={currentUser}
        />

        {/* Logo Header */}
        <div className="flex justify-center -mt-6 mb-1">
          <img
            src="/icons/LetsWatchOut Logo.svg"
            alt="LetsWatchOut"
            className="h-[62px] sm:h-[107px] w-auto"
          />
        </div>
      {activeTab !== 'watching' && (
        activeTab === 'chats' ? (
          /* Fixed-height container so hint text and StatusRow share the same space */
          <div className="relative h-[108px]">
            <p className={`absolute inset-x-0 text-center px-4 py-3 text-gray-700 dark:text-gray-300 transition-opacity duration-700 ${showTabHint ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              Say hi! Connect with friends and see what they&apos;re watching.
            </p>
            <div className={`absolute inset-x-0 transition-opacity duration-700 ${!showTabHint ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <StatusRow
                feed={statusFeed}
                currentUser={currentUser}
                onView={entry => setViewingStatus(entry)}
                onAdd={() => setShowStatusCreator(true)}
              />
            </div>
          </div>
        ) : (
          <p className={`block text-center mb-6 text-gray-700 dark:text-gray-300 transition-opacity duration-700 ${showTabHint ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {activeTab === 'rooms'
              ? 'Welcome! Find or create a room to start watching together.'
              : activeTab === 'feed'
              ? 'Explore posts and recordings from the community.'
              : ''}
          </p>
        )
      )}

      {/* Unified search bar — appears above the tab bar for whichever tab is active */}
      {((activeTab === 'rooms'    && showRoomsSearch)    ||
        (activeTab === 'chats'   && showChatsSearch)    ||
        (activeTab === 'watching' && showSessionSearch)  ||
        (activeTab === 'feed'    && showDiscoverSearch)) && (
        <div className="px-4 pb-2">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              key={activeTab}
              type="text"
              autoFocus
              placeholder={
                activeTab === 'rooms'    ? 'Search rooms...'                  :
                activeTab === 'chats'   ? 'Search friends or find people…'   :
                activeTab === 'watching' ? 'Search sessions...'               :
                                          'Search posts...'
              }
              value={
                activeTab === 'rooms'    ? searchTerm       :
                activeTab === 'chats'   ? friendsSearchTerm :
                activeTab === 'watching' ? sessionSearch    :
                                          discoverSearch
              }
              onChange={e => {
                const v = e.target.value;
                if      (activeTab === 'rooms')    handleSearchChange(e);
                else if (activeTab === 'chats')    { setFriendsSearchTerm(v); setAddFriendQuery(v); }
                else if (activeTab === 'watching') setSessionSearch(v);
                else                               setDiscoverSearch(v);
              }}
              className="w-full pl-10 pr-10 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white placeholder-gray-400"
            />
            {(activeTab === 'rooms'    ? searchTerm       :
              activeTab === 'chats'   ? friendsSearchTerm :
              activeTab === 'watching' ? sessionSearch    :
                                        discoverSearch) && (
              <button
                onClick={() => {
                  if      (activeTab === 'rooms')    setSearchTerm('');
                  else if (activeTab === 'chats')    { setFriendsSearchTerm(''); setAddFriendQuery(''); setAddFriendResults([]); }
                  else if (activeTab === 'watching') setSessionSearch('');
                  else                               setDiscoverSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Inline 4-tab bar — always dark so active=white works on all tabs ── */}
      <div ref={tabBarRef} className="mb-1 sm:mb-2 bg-gray-900 dark:bg-gray-700 rounded-xl">
        <div className="flex border-b border-white/10">
          {[
            { id: 'chats',    label: 'Chats' },
            { id: 'rooms',    label: 'Rooms' },
            { id: 'watching', label: 'WatchOuts' },
            { id: 'feed',     label: 'Feed' },
          ].map(tab => {
            const isActive   = activeTab === tab.id;
            const chatUnread = tab.id === 'chats'
              ? Object.values(unreadCounts).reduce((s, c) => s + c, 0)
              : 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 py-2 transition-colors
                  ${isActive ? 'font-bold text-white' : 'font-semibold text-white/40 hover:text-white/70'}`}
              >
                {/* Wrap label + badge together so badge anchors to text width */}
                <span className="relative inline-flex items-center">
                  <span className="text-sm sm:text-base md:text-lg">{tab.label}</span>

                  {/* Chats unread badge */}
                  {chatUnread > 0 && (
                    <span className="absolute -top-2 -right-4 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[9px] font-bold bg-green-600 text-white rounded-full">
                      {chatUnread}
                    </span>
                  )}

                  {/* Friend request badge — purple "+N", offset right when unread badge also showing */}
                  {tab.id === 'chats' && pendingRequests.length > 0 && (
                    <span className={`absolute -top-2 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[9px] font-bold bg-purple-500 text-white rounded-full ${chatUnread > 0 ? '-right-8' : '-right-4'}`}>
                      +{pendingRequests.length}
                    </span>
                  )}

                  {/* WatchOuts session badge */}
                  {tab.id === 'watching' && sessions.length > 0 && (
                    <span className="absolute -top-2 -right-4 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full">
                      {sessions.length}
                    </span>
                  )}
                </span>

                {/* Active underline */}
                {isActive && (
                  <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ✅ ROOMS TAB CONTENT */}
      {activeTab === 'rooms' && (
        <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Available Rooms {searchTerm && ` (Filtered: ${filteredRooms.length}/${rooms.length})`}
          </h2>

          {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center h-32">
            <p className="text-lg text-gray-700 dark:text-gray-300">Loading rooms...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Data Display */}
        {!loading && !error && (
          <>
            {filteredRooms && filteredRooms.length > 0 ? (
              (() => {
                const ownedRooms = filteredRooms.filter(r => r.host_id === authenticatedUserID);
                const memberRooms = filteredRooms.filter(r => r.is_member && r.host_id !== authenticatedUserID);
                const discoveryRoomsRaw = filteredRooms.filter(r => !r.is_member && r.host_id !== authenticatedUserID);
                // Guests see all public rooms sorted by rating desc, then oldest first
                const discoveryRooms = authenticatedUserID
                  ? discoveryRoomsRaw
                  : [...discoveryRoomsRaw].sort((a, b) => {
                      const aR = a.average_rating || 0;
                      const bR = b.average_rating || 0;
                      if (bR !== aR) return bR - aR;
                      return new Date(a.created_at) - new Date(b.created_at);
                    });
                const collapseMemberRooms = memberRooms.length > 5;

                // Helper: renders a single room card (shared across all sections)
                const RoomCard = (room) => (
                  <div
                    key={`card-${room.id}`}
                    className={`group bg-gradient-to-br from-purple-50 to-blue-50 dark:bg-gray-800 shadow-lg rounded-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200 relative cursor-pointer ${
                      room.host_id === authenticatedUserID
                        ? 'ring-2 ring-purple-500 dark:ring-purple-400'
                        : room.is_member
                        ? 'ring-2 ring-blue-500 dark:ring-blue-400'
                        : 'border border-gray-200 dark:border-gray-700'
                    }`}
                    onMouseEnter={() => prefetchRoom(room.id)}
                    onClick={() => {
                      if (roomLongPressActive.current) { roomLongPressActive.current = false; return; }
                      navigate(`/rooms/${room.id}`, { state: { roomData: room } });
                    }}
                    onTouchStart={() => {
                      prefetchRoom(room.id);
                      roomLongPressActive.current = false;
                      roomLongPressRef.current = setTimeout(() => {
                        roomLongPressActive.current = true;
                        setOpenMenuRoomId(room.id);
                        if (navigator.vibrate) navigator.vibrate(50);
                      }, 500);
                    }}
                    onTouchMove={() => { if (roomLongPressRef.current) { clearTimeout(roomLongPressRef.current); roomLongPressRef.current = null; } }}
                    onTouchEnd={() => { if (roomLongPressRef.current) { clearTimeout(roomLongPressRef.current); roomLongPressRef.current = null; } }}
                  >
                  {/* 3-dot button — visible on hover (desktop) and after long-press (mobile) */}
                  <button
                    className="room-menu absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/10 dark:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (openMenuRoomId === room.id) {
                        setOpenMenuRoomId(null);
                        setOpenMenuPosition(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setOpenMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                        setOpenMenuRoomId(room.id);
                      }
                    }}
                    title="More options"
                  >
                    <EllipsisVerticalIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
                  </button>
                  {/* Room Card inner — identical to original */}
                  <div className="flex items-center p-3 sm:p-4 gap-3 sm:gap-5">
                      <div className="flex-shrink-0 relative">
                        {room.is_active_session && (
                          <>
                            <div className="absolute -inset-2 sm:-inset-3 rounded-full bg-red-500/30 animate-ping"></div>
                            <div className="absolute inset-0 w-20 h-20 sm:w-28 sm:h-28 rounded-full ring-[3px] ring-red-500 animate-pulse pointer-events-none" style={{ animationDuration: '2s' }}></div>
                          </>
                        )}
                        <div className={`relative w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${room.is_active_session ? '' : 'ring-2 ring-gray-300 dark:ring-gray-600'}`}>
                          {room.image_url ? (
                            <img src={cdnThumb(getAssetUrl(room.image_url), 160)} alt={room.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <FilmIcon className="w-8 h-8 sm:w-12 sm:h-12 text-white opacity-80" />
                          )}
                        </div>
                        {room.is_active_session && (
                          <div className="absolute bottom-0.5 right-0.5 bg-green-500 rounded-full p-1.5 sm:p-2 animate-pulse shadow-lg ring-2 ring-white dark:ring-gray-800" title="Live Watch Session">
                            <svg className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-0.5 sm:mb-1">
                          <h2 className="text-base sm:text-xl font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate">{room.name}</h2>
                          {room.is_member && room.host_id !== authenticatedUserID && (
                            <span className="flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full flex-shrink-0 w-fit">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>
                              Member
                            </span>
                          )}
                        </div>
                        {room.handle && <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium leading-none mb-1">@{room.handle}</p>}
                        <div className="flex items-center gap-2 mt-1 mb-1">
                          {room.average_rating > 0 ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full">
                              <svg className="w-3 h-3 fill-yellow-500" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                              {room.average_rating.toFixed(1)}
                            </span>
                          ) : null}
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>
                            {room.member_count || 0}
                          </span>
                        </div>
                        {/* Last chat message — its own row (3rd row), not floated beside the name */}
                        {room.last_chat_message && (
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate mb-1 pr-10 sm:pr-12">
                            💬 {room.last_chat_message.length > 50 ? room.last_chat_message.slice(0, 50) + '…' : room.last_chat_message}
                            {room.last_chat_at && (
                              <span className="text-gray-400 dark:text-gray-500"> · {new Date(room.last_chat_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </p>
                        )}
                        {(room.show_description === true || room.ShowDescription === true) && room.description && room.description.trim() !== '' && (
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1.5 sm:mb-2 pr-10 sm:pr-12 leading-relaxed">{room.description}</p>
                        )}
                      </div>
                      {/* Upcoming events badge — matches RoomPageNew scheduleWatchIcon style */}
                      {room.has_upcoming_events && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomForEvents(room);
                            setIsEventsModalOpen(true);
                          }}
                          className="relative flex-shrink-0 ml-2 p-1 hover:opacity-80 transition-opacity"
                          title={`${room.upcoming_events_count} upcoming event${room.upcoming_events_count !== 1 ? 's' : ''}`}
                        >
                          <img
                            src="/icons/scheduleWatchIcon.svg"
                            alt="Schedule"
                            className="h-[34px] w-[34px]"
                          />
                          {room.upcoming_events_count > 0 && (
                            <div className="absolute -top-1 -right-1 min-w-[18px] h-5 flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1 shadow-lg bg-purple-500">
                              {room.upcoming_events_count}
                            </div>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );

                return (
                <>
                {/* Fixed room card dropdown — renders outside scroll container so it's never clipped */}
                {openMenuRoomId && openMenuPosition && (() => {
                  const room = [...ownedRooms, ...memberRooms, ...discoveryRooms].find(r => r.id === openMenuRoomId);
                  if (!room) return null;
                  return (
                    <div
                      className="room-menu fixed z-[9999] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 py-1 min-w-[180px]"
                      style={{ top: openMenuPosition.top, right: openMenuPosition.right }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                        onClick={() => { setOpenMenuRoomId(null); setOpenMenuPosition(null); navigate(`/rooms/${room.id}`, { state: { roomData: room } }); }}
                      >
                        <ArrowUpIcon className="w-4 h-4 rotate-90" /> Enter Room
                      </button>
                      <button
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                        onClick={() => { setOpenMenuRoomId(null); setOpenMenuPosition(null); setShareSheetRoom({ id: room.id, name: room.name, handle: room.handle }); }}
                      >
                        <ShareIcon className="w-4 h-4" /> Share
                      </button>
                      <button
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                        onClick={(e) => { setOpenMenuRoomId(null); setOpenMenuPosition(null); handleToggleFavourite(room.id, e); }}
                      >
                        <BookmarkIcon className="w-4 h-4" /> {savedRooms[room.id] ? 'Unfavourite' : 'Favourite'}
                      </button>
                      {room.host_id !== authenticatedUserID && (
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center gap-2.5 transition-colors"
                          onClick={() => { setOpenMenuRoomId(null); setOpenMenuPosition(null); setReportTarget({ targetType: 'room', targetId: room.id, targetName: room.name }); }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                          Report Room
                        </button>
                      )}
                      {(room.host_id === authenticatedUserID || currentUser?.role === 'super_admin') && (
                        <>
                          <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />
                          <button
                            className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors"
                            onClick={() => { setOpenMenuRoomId(null); setOpenMenuPosition(null); handleOpenDeleteModal(room); }}
                          >
                            <TrashIcon className="w-4 h-4" /> Delete Room
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Share sheet — shown when Share is tapped from room card menu */}
                {shareSheetRoom && (
                  <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center" onClick={() => setShareSheetRoom(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-80 p-5 border border-gray-100 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-4">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm truncate pr-4">{shareSheetRoom.name}</p>
                        <button onClick={() => setShareSheetRoom(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0">
                          <XMarkIcon className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        {/* Copy Link */}
                        <button
                          onClick={async () => { await handleShareRoom(shareSheetRoom.id, shareSheetRoom.name, shareSheetRoom.handle); setShareSheetRoom(null); }}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-700 dark:text-gray-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                          </div>
                          <span className="text-[10px] text-gray-600 dark:text-gray-300">Copy Link</span>
                        </button>
                        {/* WhatsApp */}
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`Join me in "${shareSheetRoom.name}" on LetsWatchOut! ${buildRoomShareUrl(shareSheetRoom)}`)}`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={() => setShareSheetRoom(null)}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.927 1.399 5.591L0 24l6.59-1.383A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.366l-.36-.214-3.713.979.994-3.63-.234-.373A9.818 9.818 0 1112 21.818z"/></svg>
                          </div>
                          <span className="text-[10px] text-gray-600 dark:text-gray-300">WhatsApp</span>
                        </a>
                        {/* Twitter / X */}
                        <a
                          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Watching "${shareSheetRoom.name}" on LetsWatchOut — join me! ${buildRoomShareUrl(shareSheetRoom)}`)}`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={() => setShareSheetRoom(null)}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          </div>
                          <span className="text-[10px] text-gray-600 dark:text-gray-300">X</span>
                        </a>
                        {/* Telegram */}
                        <a
                          href={`https://t.me/share/url?url=${encodeURIComponent(buildRoomShareUrl(shareSheetRoom))}&text=${encodeURIComponent(`Join me in "${shareSheetRoom.name}" on LetsWatchOut!`)}`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={() => setShareSheetRoom(null)}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <div className="w-12 h-12 rounded-full bg-sky-500 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.607c-.153.676-.554.84-1.12.523l-3.1-2.284-1.496 1.44c-.165.165-.304.304-.624.304l.222-3.147 5.73-5.175c.249-.222-.054-.345-.387-.123L6.3 14.28l-3.047-.952c-.662-.207-.675-.662.138-.979l11.9-4.59c.552-.2 1.034.134.271.489z"/></svg>
                          </div>
                          <span className="text-[10px] text-gray-600 dark:text-gray-300">Telegram</span>
                        </a>
                      </div>
                      {/* Native share if supported */}
                      {navigator.share && (
                        <button
                          onClick={async () => { try { await navigator.share({ title: shareSheetRoom.name, url: buildRoomShareUrl(shareSheetRoom) }); } catch {} setShareSheetRoom(null); }}
                          className="mt-4 w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
                        >
                          Share via…
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Guest CTA — shown when not signed in */}
                {!authenticatedUserID && (
                  <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-500/30 rounded-xl p-3 mb-4">
                    <span className="text-2xl flex-shrink-0">👋</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-purple-300 text-sm font-medium">Join to watch together!</p>
                      <p className="text-gray-400 text-xs">Sign up to join rooms and connect with others.</p>
                    </div>
                    <button
                      onClick={() => navigate('/register')}
                      className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap flex-shrink-0"
                    >
                      Sign Up Free
                    </button>
                  </div>
                )}

                {/* Owned rooms — always visible at top */}
                {ownedRooms.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {ownedRooms.map(room => (
                      <React.Fragment key={room.id}>{RoomCard(room)}</React.Fragment>
                    ))}
                  </div>
                )}

                {/* Member Rooms: collapsible card when > 10, inline when ≤ 10 */}
                {memberRooms.length > 0 && (
                  collapseMemberRooms ? (
                    <div className="mb-3">
                      {ownedRooms.length > 0 && <div className="border-t border-gray-200 dark:border-gray-700 mb-3" />}
                      {/* Collapsed card header */}
                      <button
                        onClick={() => setIsMemberCardExpanded(prev => !prev)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <UsersIcon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                            {memberRooms.length} Member Rooms
                          </p>
                          <p className="text-xs text-blue-500 dark:text-blue-400">
                            {isMemberCardExpanded ? 'Click to collapse' : 'Click to expand'}
                          </p>
                        </div>
                        <svg
                          className={`w-5 h-5 text-blue-600 dark:text-blue-400 transition-transform ${isMemberCardExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {/* Expanded rooms */}
                      {isMemberCardExpanded && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {memberRooms.map(room => (
                            <React.Fragment key={room.id}>{RoomCard(room)}</React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {ownedRooms.length > 0 && <div className="border-t border-gray-200 dark:border-gray-700 mb-3" />}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        {memberRooms.map(room => (
                          <React.Fragment key={room.id}>{RoomCard(room)}</React.Fragment>
                        ))}
                      </div>
                    </>
                  )
                )}

                {/* Discovery rooms */}
                {discoveryRooms.length > 0 && (
                  <>
                    {(ownedRooms.length > 0 || memberRooms.length > 0) && (
                      <div className="border-t border-gray-200 dark:border-gray-700 mb-3" />
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {discoveryRooms.map(room => (
                        <React.Fragment key={room.id}>{RoomCard(room)}</React.Fragment>
                      ))}
                    </div>
                  </>
                )}

                {/* Infinite scroll sentinel */}
                <div ref={roomsObserverTarget} className="w-full py-4">
                  {loadingMoreRooms && (
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <span className="ml-3 text-gray-600 dark:text-gray-400">Loading more rooms...</span>
                    </div>
                  )}
                  {!hasMoreRooms && rooms.length > 0 && (
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm">No more rooms to load</p>
                  )}
                </div>
                </>
                );
              })()
            ) : (
              <div className="text-center py-10">
                {searchTerm ? (
                  <>
                    <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No rooms match your search for "{searchTerm}".</p>
                    <button
                      onClick={() => setSearchTerm('')}
                      className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Clear Search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No rooms available yet.</p>
                    <button
                      onClick={handleCreateRoom}
                      className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Be the first to create one!
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        
        </div>
      )}

      {/* ✅ WATCHOUTS - TikTok snap-scroll (always mounted; hidden when not active to avoid video teardown lag) */}
      <div
          ref={watchingNowScrollRef}
          className="overflow-y-scroll snap-y snap-mandatory bg-black"
          style={
            activeTab !== 'watching'
              ? { display: 'none' }
              : communityCardVisible
              ? { display: 'block', position: 'relative', top: -watchingTopOffset, height: `calc(100dvh - ${watchingTopOffset}px - ${watchingBottomPad}px)`, zIndex: 45, scrollbarWidth: 'none', msOverflowStyle: 'none' }
              : { display: 'block', height: `calc(100dvh - ${watchingTopOffset}px - ${watchingBottomPad}px)`, scrollbarWidth: 'none', msOverflowStyle: 'none' }
          }
          aria-hidden={activeTab !== 'watching'}
          onTouchStart={activeTab === 'watching' ? handleTouchStart : undefined}
          onTouchMove={activeTab === 'watching' ? handleTouchMove : undefined}
          onTouchEnd={activeTab === 'watching' ? handleTouchEnd : undefined}
      >
          <style>{`.watching-scroll::-webkit-scrollbar { display: none; }`}</style>
          <style>{pulseAnimationStyles}</style>

          {/* Empty state */}
          {!sessionsPage.loading && sessionsPage.data.length === 0 && trailersPage.data.length === 0 && (
            <div className="relative h-full w-full snap-start flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-gray-900 to-black text-white text-center px-8 overflow-hidden">
              {/* Sleeping icon with floating Zzz */}
              <div className="relative mb-8 flex items-center justify-center w-28 h-28">
                <img src="/icons/lwoIcon.webp" alt="WatchOut" className="w-20 h-20 opacity-25" onError={e => { e.target.style.display='none'; }} />
                {/* Zzz float up from top-right of icon */}
                <span className="zzz-1 absolute text-white/70 font-bold select-none pointer-events-none"
                  style={{ fontSize: '12px', top: '8px', right: '8px' }}>z</span>
                <span className="zzz-2 absolute text-white/70 font-bold select-none pointer-events-none"
                  style={{ fontSize: '16px', top: '0px', right: '18px' }}>z</span>
                <span className="zzz-3 absolute text-white/70 font-bold select-none pointer-events-none"
                  style={{ fontSize: '22px', top: '-10px', right: '28px' }}>Z</span>
              </div>
              <p className="text-xl font-semibold mb-2">No WatchOuts right now</p>
              <p className="text-gray-400 text-sm">Start a WatchOut — go live and invite friends to watch with you!</p>
              {/* Peekaboo strip — hints community events below when there's content */}
              {(communityEventsData.scheduledEvents.length > 0 || communityEventsData.requests.length > 0) && (
                <div className="community-peek absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-purple-800 via-indigo-900/90 to-transparent flex items-end justify-center pb-3 gap-2 pointer-events-none select-none">
                  <ArrowUpIcon className="w-4 h-4 text-white/80" />
                  <span className="text-white/80 text-sm font-medium">📅 Community Events</span>
                </div>
              )}
            </div>
          )}

          {/* Loading skeleton */}
          {sessionsPage.loading && sessionsPage.data.length === 0 && (
            <div className="h-full w-full snap-start flex items-center justify-center bg-black">
              <div className="animate-spin h-12 w-12 border-4 border-white/20 border-t-white rounded-full" />
            </div>
          )}

          {/* ── Trailers ── */}
          {trailersPage.data.map((trailer) => {
            const trailerHostId = trailer.host_user_id || trailer.HostUserID;
            const isTrailerHost = currentUser && (currentUser.id === trailerHostId || currentUser.ID === trailerHostId);
            return (
              <div key={`t-${trailer.ID}`} className="relative h-full w-full snap-start snap-always overflow-hidden">
                {isImageUrl(trailer.trailer_url) ? (
                  <img
                    src={resolvePreviewUrl(trailer.trailer_url)}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={resolvePreviewUrl(trailer.trailer_url)}
                    autoPlay loop muted={videoMuted} playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90 pointer-events-none" />

                {/* COMING SOON badge — top-left */}
                <img
                  src="/icons/coming soon.png"
                  alt="Coming Soon"
                  className="absolute top-4 left-4 z-10 h-8 w-auto drop-shadow-lg"
                />

                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                  <h4 className="text-2xl font-bold mb-0.5 drop-shadow-lg leading-tight">
                    {trailer.trailer_title || trailer.title}
                  </h4>
                  <p className="text-sm font-semibold mb-1 drop-shadow-md" style={{ color: '#a78bfa' }}>
                    {trailer.Room?.name || 'Event Room'}
                  </p>
                  {trailer.description && (
                    <p className="text-xs text-gray-300 mb-3 drop-shadow-md line-clamp-2">{trailer.description}</p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-300">
                      <span className="text-gray-400">Starts</span>{' '}
                      <span className="font-semibold text-white">{new Date(trailer.start_time).toLocaleString()}</span>
                    </p>
                    {!isTrailerHost && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedEventForCalendar(trailer); setIsCalendarModalOpen(true); }}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg font-semibold transition-colors shadow-lg"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Add to Calendar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Live session cards ── */}
          {(() => {
            // Renders logo-bug + lower-third overlays sourced from the session's stored liveshare graphics state
            const LiveShareOverlay = ({ session }) => {
              if (!session.is_screen_sharing_active) return null;
              let logo = null;
              let lowerThird = null;
              try { logo = session.liveshare_logo_bug ? JSON.parse(session.liveshare_logo_bug) : null; } catch {}
              try { lowerThird = session.liveshare_lower_third ? JSON.parse(session.liveshare_lower_third) : null; } catch {}
              if (!logo && !lowerThird) return null;
              return (
                <div className="absolute inset-0 pointer-events-none z-10">
                  {logo?.imageUrl && (
                    <img
                      src={logo.imageUrl}
                      alt=""
                      className="absolute top-2 right-2 h-7 w-auto object-contain opacity-90"
                    />
                  )}
                  {lowerThird?.name && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-gradient-to-t from-black/70 to-transparent">
                      <p className="text-white text-xs font-semibold leading-tight truncate">{lowerThird.name}</p>
                      {lowerThird.title && <p className="text-gray-300 text-[10px] leading-tight truncate">{lowerThird.title}</p>}
                    </div>
                  )}
                </div>
              );
            };

            const filtered = sessionsPage.data.filter(s => {
              if (!sessionSearch.trim()) return true;
              const q = sessionSearch.toLowerCase();
              return (
                s.room_name?.toLowerCase().includes(q) ||
                s.host_username?.toLowerCase().includes(q) ||
                s.session_title?.toLowerCase().includes(q) ||
                s.watch_type?.toLowerCase().includes(q)
              );
            });
            const hasCommunityContent = communityEventsData.scheduledEvents.length > 0 || communityEventsData.requests.length > 0;
            const sessionCards = filtered.map((session) => {
              const preview = sessionPreviews[session.session_id] || {};
              const watchTypeConfig = {
                classroom: { emoji: '🎓', name: 'Classroom' },
                '3d_cinema': { emoji: '🎭', name: '3D Cinema' },
                video: { emoji: '🎬', name: 'Video Watch' },
              };
              const watchType = watchTypeConfig[session.watch_type] || watchTypeConfig.video;

              return (
                <div
                  key={session.session_id}
                  className="relative h-full w-full snap-start snap-always overflow-hidden cursor-pointer"
                  onClick={() => handleJoinSessionDirect(session)}
                >
                  {/* Full-bleed preview */}
                  <div className="absolute inset-0">
                    <SessionPreview
                      session={session}
                      previewUrl={preview.previewUrl}
                      posterUrl={preview.posterUrl}
                      isGenerating={preview.isGenerating}
                      isClearing={preview.isClearing || false}
                      muted={videoMuted}
                      previewVersion={preview.version}
                    />
                    <LiveShareOverlay session={session} />
                  </div>

                  {/* Top gradient — mute button readability */}
                  <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
                  {/* Bottom gradient */}
                  <div className="absolute bottom-0 left-0 right-0 h-2/5 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

                  {/* Mute button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVideoMute(); }}
                    className="absolute top-4 left-4 z-10 bg-black/40 backdrop-blur-sm p-2 rounded-full"
                  >
                    {videoMuted ? (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" /></svg>
                    )}
                  </button>

                  {/* Right-side icon stack */}
                  <div className="absolute bottom-28 right-4 flex flex-col items-center gap-5 pointer-events-auto">
                    <button onClick={(e) => { e.stopPropagation(); handleSessionLike(session.session_id, e); }} className="flex flex-col items-center gap-1 transition-transform active:scale-90">
                      <HeartIcon
                        key={`heart-tiktok-${session.session_id}-${!!sessionLikes[session.session_id]?.isLiked}`}
                        className={`w-9 h-9 ${sessionLikes[session.session_id]?.isLiked ? 'text-red-500 [animation:heartPop_0.4s_ease]' : 'text-white'}`}
                        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                      <span className="text-white text-xs font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{formatCount(sessionLikes[session.session_id]?.count || 0)}</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleOpenChatPreview(session, e); }} className="flex flex-col items-center gap-1 transition-transform active:scale-90">
                      <ChatBubbleOvalLeftEllipsisIcon className="w-9 h-9 text-white" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                      <span className="text-white text-xs font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{formatCount(sessionChatCounts[session.session_id] || 0)}</span>
                    </button>
                    <div className="flex flex-col items-center gap-1">
                      <img src="/icons/view.png" alt="viewers" className="w-9 h-9 object-contain" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                      <span className="text-white text-xs font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{formatCount(session.member_count || 0)}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShareModalSession(session); }}
                      className="flex flex-col items-center gap-1 transition-transform active:scale-90"
                    >
                      <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }}>
                        <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                      </svg>
                    </button>
                  </div>

                  {/* Bottom info */}
                  <div className="absolute bottom-20 left-4 right-16 pointer-events-auto" style={{ fontFamily: '"Outfit", -apple-system, "Segoe UI", sans-serif' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        onClick={(e) => { e.stopPropagation(); if (!session.is_temporary) navigate(`/rooms/${session.room_id}`); }}
                        className="relative flex-shrink-0 cursor-pointer"
                      >
                        <div className="absolute -inset-1 rounded-full bg-red-500/30 animate-ping" />
                        <div className="absolute inset-0 w-9 h-9 rounded-full ring-2 ring-red-500 animate-pulse pointer-events-none" style={{ animationDuration: '2s' }} />
                        <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden">
                          {session.room_avatar_url
                            ? <img src={cdnThumb(getAssetUrl(session.room_avatar_url), 72)} alt={session.room_name} className="w-full h-full object-cover" />
                            : session.room_name?.[0]?.toUpperCase() || 'R'}
                        </div>
                        {!session.is_member && !joinedRooms[session.room_id] && session.host_id !== currentUser?.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleJoinRoomFromCard(session.room_id, e); }}
                            className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 bg-purple-600 rounded-full flex items-center justify-center z-10 shadow-md transition-transform active:scale-90"
                            style={{ width: '14px', height: '14px', minWidth: '14px', minHeight: '14px' }}
                          >
                            <svg viewBox="0 0 10 10" fill="white" style={{ width: '9px', height: '9px', flexShrink: 0 }}>
                              <rect x="4.2" y="1" width="1.6" height="8" rx="0.8"/>
                              <rect x="1" y="4.2" width="8" height="1.6" rx="0.8"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      <span className="font-bold text-white text-base truncate" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{session.room_name}</span>
                      {session.average_rating > 0 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          <span className="text-white text-sm font-bold">{session.average_rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    <h3 className="text-white text-base font-bold leading-tight line-clamp-2 mb-1" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                      {session.session_title || session.currently_playing || 'Live Session'}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                      {session.content_rating && (
                        session.content_rating === 'Educational' ? (
                          <img src="/icons/E.webp" alt="Educational" className="w-5 h-5 object-contain flex-shrink-0" />
                        ) : session.content_rating === 'Religious' ? (
                          <img src="/icons/R.png" alt="Religious" className="w-5 h-5 object-contain flex-shrink-0" />
                        ) : (
                          <span className="text-white text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/20 backdrop-blur-sm border border-white/30 flex-shrink-0">
                            {session.content_rating === 'Mature' ? 'M' : session.content_rating}
                          </span>
                        )
                      )}
                      {session.ticketing_enabled && session.ticket_price_tokens > 0 && (
                        <span className="text-yellow-300 font-semibold">🪙 {session.early_bird_active && session.early_bird_enabled ? session.early_bird_price_tokens : session.ticket_price_tokens} tokens</span>
                      )}
                    </div>
                  </div>

                  {/* ─── Tap to Join strip ─────────────────────────────────── */}
                  <div className="absolute bottom-6 left-0 right-0 flex items-center gap-3 px-5 pointer-events-none">
                    <div className="flex-1 h-px bg-white/50" />
                    <span className="text-white text-sm font-black tracking-[0.25em] whitespace-nowrap" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
                      {session.ticketing_enabled && session.ticket_price_tokens > 0 ? 'Tap to Purchase & Join' : 'Tap to Join'}
                    </span>
                    <div className="flex-1 h-px bg-white/50" />
                  </div>
                </div>
              );
            });

            // Interleave CommunityEventsCard every 5 live session cards.
            // If there are 0 live sessions but community content exists, show it first.
            if (!hasCommunityContent) return sessionCards;

            const communitySlot = (key) => (
              <div key={key} data-community-card className="relative h-full w-full flex-shrink-0 snap-start snap-always bg-black">
                <CommunityEventsCard
                  scheduledEvents={communityEventsData.scheduledEvents}
                  requests={communityEventsData.requests}
                  leaderboard={leaderboardData}
                  vsBattleLeaderboard={vsBattleLeaderboardData}
                  currentUser={currentUser}
                  apiBaseUrl={API_BASE_URL}
                  onRSVP={(event) => { setSelectedEventForCalendar(event); setIsCalendarModalOpen(true); }}
                  onNewRequest={(newReq) => setCommunityEventsData(prev => ({ ...prev, requests: [newReq, ...prev.requests] }))}
                  fixedBottom={communityCardVisible ? watchingBottomPad : undefined}
                />
              </div>
            );

            if (sessionCards.length === 0) return [communitySlot('community-events-empty')];

            const result = [];
            sessionCards.forEach((card, idx) => {
              result.push(card);
              if ((idx + 1) % 5 === 0) {
                result.push(communitySlot(`community-events-${idx}`));
              }
            });
            return result;
          })()}

          {/* Infinite scroll trigger */}
          <div ref={loadMoreTriggerRef} className="h-2 snap-start" />

          {/* Loading more spinner */}
          {(sessionsPage.loading || trailersPage.loading) && sessionsPage.data.length > 0 && (
            <div className="h-full snap-start flex items-center justify-center bg-black">
              <div className="animate-spin h-10 w-10 border-4 border-white/20 border-t-white rounded-full" />
            </div>
          )}

          {/* Legacy watching-now content blocks (not rendered — preserved below) */}
          {false && (<>
          <div className={watchingSubTab === 'sessions' ? 'block' : 'hidden'}>
            <>
          <h2 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-white text-center">
            Watching Now {sessionsPage.data.length > 0 && `(${sessionsPage.data.length + trailersPage.data.length} items)`}
          </h2>

          {/* ✅ Trailers Section (auto-play loops) */}
          {trailersPage.data.length > 0 && (
            <div className="mb-8">
              <div className="space-y-6">{trailersPage.data.map((trailer, index) => (
                  <div 
                    key={trailer.ID}
                    onClick={() => handleOpenFullscreen(index)}
                    className="relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-300 cursor-pointer"
                    style={{ minHeight: '400px' }}
                  >
                    {/* Trailer media */}
                    {isImageUrl(trailer.trailer_url) ? (
                      <img
                        src={resolvePreviewUrl(trailer.trailer_url)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={resolvePreviewUrl(trailer.trailer_url)}
                        autoPlay loop muted={videoMuted} playsInline
                        className="w-full h-full object-cover"
                      />
                    )}
                    
                    {/* Mute/Unmute Button - Top Left Overlay */}
                    <button
                      onClick={toggleVideoMute}
                      className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm p-2 rounded-full hover:bg-black/80 transition-colors z-20"
                      title={videoMuted ? 'Unmute' : 'Mute'}
                    >
                      {videoMuted ? (
                        // Muted Icon (X through speaker)
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        // Unmuted Icon (speaker with sound waves)
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    
                    {/* Gradient overlays */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 pointer-events-none"></div>
                    
                    {/* Top Left: Coming Soon Stamp + Room Name */}
                    <div className="absolute top-6 left-6 z-10">
                      {/* Semi-transparent stamp effect */}
                      <div className="relative mb-3">
                        <div className="bg-red-600/30 backdrop-blur-sm border-4 border-red-500/50 text-red-100 px-6 py-3 transform -rotate-12 shadow-2xl">
                          <div className="text-2xl font-black tracking-wider" style={{ fontFamily: 'Impact, Arial Black, sans-serif', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                            COMING SOON
                          </div>
                        </div>
                      </div>
                      {/* Room name below stamp */}
                      <h3 className="text-2xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                        {trailer.Room?.name || 'Event Room'}
                      </h3>
                    </div>
                    
                    {/* Bottom: Event Details */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                      <h4 className="text-2xl font-bold mb-2 drop-shadow-lg">{trailer.trailer_title || trailer.title}</h4>
                      <p className="text-sm text-gray-200 mb-3 drop-shadow-md">{trailer.description}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm drop-shadow-md">
                          <span className="text-gray-300">Starts:</span> <span className="font-semibold">{new Date(trailer.start_time).toLocaleString()}</span>
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEventForCalendar(trailer);
                            setIsCalendarModalOpen(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg font-medium transition-colors shadow-lg"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Add to Calendar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ✅ Active Sessions Section */}
          {sessionsPage.data.length > 0 && (() => {
            // 🔍 Filter sessions by search term (room name, host username, content rating, session title, watch type)
            const filteredSessions = sessionsPage.data.filter(session => {
              if (!discoverSearch.trim()) return true; // No search = show all
              
              const searchLower = discoverSearch.toLowerCase();
              return (
                (session.room_name && session.room_name.toLowerCase().includes(searchLower)) ||
                (session.host_username && session.host_username.toLowerCase().includes(searchLower)) ||
                (session.content_rating && session.content_rating.toLowerCase().includes(searchLower)) ||
                (session.session_title && session.session_title.toLowerCase().includes(searchLower)) ||
                (session.watch_type && session.watch_type.toLowerCase().includes(searchLower))
              );
            });
            
            if (filteredSessions.length === 0) {
              return (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-lg font-medium">No sessions found</p>
                  <p className="text-sm mt-1">Try a different search term</p>
                </div>
              );
            }
            
            return (
            <div>
              <div className="space-y-6">
                {filteredSessions.map((session, index) => {
                  const preview = sessionPreviews[session.session_id] || {};
                  
                  // Determine watch type display
                  const watchTypeConfig = {
                    'classroom': { emoji: '🎓', name: 'Classroom', color: 'green' },
                    '3d_cinema': { emoji: '🎭', name: '3D Cinema', color: 'blue' },
                    'video': { emoji: '🎬', name: 'Video Watch', color: 'purple' }
                  };
                  const watchType = watchTypeConfig[session.watch_type] || watchTypeConfig['video'];
                  
                  // Calculate index for fullscreen (trailers.length + session index)
                  const fullscreenIndex = trailersPage.data.length + index;
                  
                  // 🎯 Inject ad every 7 items
                  const shouldShowAd = feedAds.length > 0 && (index + 1) % 7 === 0;
                  
                  return (
                    <React.Fragment key={session.session_id}>
                      {/* Regular Session Card */}
                  <div 
                    key={session.session_id}
                    onClick={() => handleOpenFullscreen(fullscreenIndex)}
                    className="relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-[1.02] cursor-pointer group"
                    style={{ minHeight: '500px' }}
                  >
                    {/* Preview Background */}
                    <div className="absolute inset-0">
                      <SessionPreview
                        session={session}
                        previewUrl={preview.previewUrl}
                        posterUrl={preview.posterUrl}
                        isGenerating={preview.isGenerating}
                        isClearing={preview.isClearing || false}
                        muted={videoMuted}
                        previewVersion={preview.version}
                      />
                      <LiveShareOverlay session={session} />
                    </div>

                    {/* Mute/Unmute Button - Top Left Overlay */}
                    <button
                      onClick={toggleVideoMute}
                      className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm p-2 rounded-full hover:bg-black/80 transition-colors z-20"
                      title={videoMuted ? 'Unmute' : 'Mute'}
                    >
                      {videoMuted ? (
                        // Muted Icon (X through speaker)
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        // Unmuted Icon (speaker with sound waves)
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    
                    {/* Dark Gradient Overlay for readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>
                    
                    {/* TikTok-style Minimalist Info Overlay */}
                    <div 
                      className="absolute bottom-4 left-4 right-20 text-white pointer-events-auto"
                      style={{ fontFamily: '"Outfit", -apple-system, "Segoe UI", sans-serif' }}
                    >
                      {/* Row 1: Room Avatar + Name & Star + Content Rating */}
                      <div className="flex items-center gap-3 mb-3">
                        {/* Room Avatar with Live Ring */}
                        <div 
                          onClick={!session.is_temporary ? (e) => {
                            e.stopPropagation();
                            navigate(`/rooms/${session.room_id}`);
                          } : undefined}
                          className={`relative flex-shrink-0 ${
                            !session.is_temporary ? 'cursor-pointer group' : ''
                          }`}
                        >
                          {/* Subtle expanding ring (background) */}
                          <div className="absolute -inset-1 rounded-full bg-red-500/30 animate-ping"></div>
                          
                          {/* Pulsing red ring overlay */}
                          <div className="absolute inset-0 w-10 h-10 rounded-full ring-[3px] ring-red-500 animate-pulse pointer-events-none" style={{ animationDuration: '2s' }}></div>
                          
                          {/* Avatar (stable, no pulse) */}
                          <div className={`relative w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden transition-transform ${
                            !session.is_temporary ? 'group-hover:scale-110' : ''
                          }`}>
                            {session.room_avatar_url ? (
                              <img src={cdnThumb(getAssetUrl(session.room_avatar_url), 80)} alt={session.room_name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              session.room_name?.[0]?.toUpperCase() || 'R'
                            )}
                          </div>
                          {!session.is_temporary && !session.is_member && session.host_id !== currentUser?.id && (
                            joinedRooms[session.room_id]
                              ? <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-10 pointer-events-none">
                                  <span className="text-white text-[8px] font-black leading-none">✓</span>
                                </div>
                              : <button onClick={(e) => { e.stopPropagation(); handleJoinRoomFromCard(session.room_id, e); }} className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 hover:bg-green-400 rounded-full flex items-center justify-center shadow-md z-10 transition-transform active:scale-90">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" className="w-2.5 h-2.5"><path d="M12 2v20M2 12h20" /></svg>
                                </button>
                          )}
                        </div>

                        {/* Room Name + Star Rating */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span
                            className="font-bold text-white text-base truncate"
                            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                          >
                            {session.room_name}
                          </span>
                          {/* Star Rating (Inline with room name) */}
                          {session.average_rating > 0 && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                              <span className="text-white font-bold text-sm" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                {session.average_rating.toFixed(1)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Row 2: Title */}
                      <div className="mb-2">
                        {/* Title */}
                        <h3
                          className="text-white text-lg font-bold leading-tight line-clamp-2"
                          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
                        >
                          {session.session_title || session.currently_playing || 'Live Session'}
                        </h3>
                      </div>
                      
                      {/* Row 3: Expandable "... more" */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = e.currentTarget;
                          const detailsDiv = target.nextElementSibling;
                          const isExpanded = detailsDiv.style.display === 'block';
                          detailsDiv.style.display = isExpanded ? 'none' : 'block';
                          target.textContent = isExpanded ? '... more' : '... less';
                        }}
                        className="text-sm text-gray-300 hover:text-white transition-colors mb-1"
                        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                      >
                        ... more
                      </button>
                      
                      {/* Expanded Details */}
                      <div 
                        className="text-sm text-gray-200 space-y-1"
                        style={{ display: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1.5">
                            <UserIcon className="w-4 h-4 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                            <span className="font-medium">{session.host_username}</span>
                          </span>
                          {session.ticketing_enabled && (
                            <span className="inline-flex items-center gap-1.5 text-yellow-300 font-semibold">
                              <span>🪙</span>
                              <span>Paid</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Right Icon Stack - TikTok Style */}
                    <div className="absolute bottom-4 right-4 flex flex-col items-center gap-4 pointer-events-auto">
                      {/* Content Rating */}
                      {session.content_rating && (
                        session.content_rating === 'Educational' ? (
                          <img src="/icons/E.webp" alt="Educational" className="w-9 h-9 object-contain" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }} />
                        ) : session.content_rating === 'Religious' ? (
                          <img src="/icons/R.png" alt="Religious" className="w-9 h-9 object-contain" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }} />
                        ) : (
                          <span className="text-white font-black text-3xl leading-none" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)' }}>
                            {session.content_rating === 'Mature' ? 'M' : session.content_rating}
                          </span>
                        )
                      )}
                      
                      {/* Likes */}
                      <button
                        onClick={(e) => handleSessionLike(session.session_id, e)}
                        className="flex flex-col items-center gap-1 group transition-transform hover:scale-110"
                      >
                        <HeartIcon
                          key={`heart-grid-${session.session_id}-${!!sessionLikes[session.session_id]?.isLiked}`}
                          className={`w-9 h-9 ${sessionLikes[session.session_id]?.isLiked ? 'text-red-500 [animation:heartPop_0.4s_ease]' : 'text-white'}`}
                          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }}
                        />
                        <span className="text-white text-xs font-bold" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                          {formatCount(sessionLikes[session.session_id]?.count || 0)}
                        </span>
                      </button>
                      
                      {/* Chat */}
                      <button
                        onClick={(e) => handleOpenChatPreview(session, e)}
                        className="flex flex-col items-center gap-1 group transition-transform hover:scale-110"
                      >
                        <ChatBubbleOvalLeftEllipsisIcon className="w-9 h-9 text-white" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                        <span className="text-white text-xs font-bold" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                          {formatCount(sessionChatCounts[session.session_id] || 0)}
                        </span>
                      </button>

                      {/* Members */}
                      <div className="flex flex-col items-center gap-1">
                        <img src="/icons/view.png" alt="viewers" className="w-9 h-9 object-contain" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                        <span className="text-white text-xs font-bold" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                          {formatCount(session.member_count || 0)}
                        </span>
                      </div>
                      {!session.is_temporary && (
                        <button onClick={(e) => handleToggleFavourite(session.room_id, e)} className="flex flex-col items-center gap-1 transition-transform active:scale-90">
                          {savedRooms[session.room_id]
                            ? <BookmarkIcon className="w-9 h-9 text-purple-400" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                            : <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }}>
                                <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z M11 7L13 7L13 9L15 9L15 11L13 11L13 13L11 13L11 11L9 11L9 9L11 9Z" />
                              </svg>
                          }
                        </button>
                      )}
                    </div>

                    <div className="absolute inset-0 border-4 border-transparent hover:border-blue-500/50 transition-colors duration-300 rounded-2xl pointer-events-none"></div>
                  </div>
                  
                  {/* 🎯 Feed Ad Card (every 7 items) */}
                  {shouldShowAd && (
                    <FeedAdCard
                      key={`ad-${index}`}
                      ad={feedAds[0]}
                      onTrackImpression={async (clicked) => {
                        try {
                          await apiClient.post(`/api/ads/campaigns/${feedAds[0].id}/track`, {
                            session_id: 'feed',
                            room_id: null,
                            clicked,
                            view_duration: 5
                          });
                        } catch (err) {
                          console.error('❌ [Lobby] Failed to track feed ad:', err);
                        }
                      }}
                    />
                  )}
                  </React.Fragment>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {/* ✅ Infinite scroll trigger (invisible element) */}
          <div 
            ref={loadMoreTriggerRef} 
            className="h-1"
            style={{ marginTop: sessionsPage.data.length > 0 || trailersPage.data.length > 0 ? '-200px' : '0' }}
          />
          
          {/* Loading indicator */}
          {(sessionsPage.loading || trailersPage.loading) && (
            <div className="text-center py-8">
              <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-gray-400 mt-4">Loading more content...</p>
            </div>
          )}
          
          {/* End of content */}
          {!sessionsPage.hasMore && !trailersPage.hasMore && (sessionsPage.data.length > 0 || trailersPage.data.length > 0) && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg">🎬 You've reached the end</p>
              <p className="text-sm mt-2">Check back later for more content!</p>
            </div>
          )}
          
          {/* Empty state */}
          {!sessionsPage.loading && !trailersPage.loading && sessionsPage.data.length === 0 && trailersPage.data.length === 0 && (
            <div className="text-center py-20">
              <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No active watch sessions or upcoming events right now.</p>
              <p className="text-gray-600 dark:text-gray-400">Start an instant watch or create a room to begin!</p>
            </div>
          )}

          </>
          </div>

          {/* ✅ FEED CONTENT */}
          <div className={watchingSubTab === 'discover' ? 'block' : 'hidden'}>
            <>
              {/* Collapsible feed search — mirrors session search pattern */}
              {showDiscoverSearch && (
                <div className="px-4 pb-2">
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input type="text" placeholder="Search posts..." value={discoverSearch} onChange={e => setDiscoverSearch(e.target.value)} autoFocus
                      className="w-full pl-10 pr-10 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white placeholder-gray-400"
                    />
                    {discoverSearch && (
                      <button onClick={() => setDiscoverSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <DiscoverFeed
                ref={discoverFeedRef}
                searchQuery={discoverSearch}
                onPostClick={(post) => {
                  setSelectedPost(post);
                  setIsPostViewModalOpen(true);
                }}
              />

            </>
          </div>
          </>)}
        </div>

      {/* ✅ Session Chat Preview Modal */}
      <SessionChatPreviewModal
        isOpen={isChatPreviewOpen}
        onClose={() => setIsChatPreviewOpen(false)}
        sessionId={selectedSessionForChat?.session_id}
        sessionTitle={selectedSessionForChat?.session_title || selectedSessionForChat?.currently_playing}
      />
      
      {/* ✅ CHATS TAB CONTENT */}
      {activeTab === 'chats' && (
        <div className={selectedChatUser ? "fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900" : ""} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          {chatsLoading ? (
            <div className={selectedChatUser ? "flex justify-center items-center h-full" : "flex justify-center items-center h-96"}>
              <p className="text-lg text-gray-700 dark:text-gray-300">Loading chats...</p>
            </div>
          ) : (
            <div className={selectedChatUser ? "h-full flex flex-col" : "h-[calc(100vh-160px)] sm:h-[calc(100vh-200px)]"}>
              {/* ✅ STACKED SINGLE-VIEW: Friends List OR DM Messages OR Group Messages */}
              {chatView === 'group_messages' && selectedGroup ? (
                /* ========== GROUP MESSAGES VIEW ========== */
                <div className="bg-white dark:bg-gray-800 shadow-lg overflow-hidden flex flex-col h-full">
                  {/* Group Header */}
                  <div className="bg-gradient-to-r from-purple-600 to-green-600 p-3 sm:p-4 flex items-center gap-3">
                    <button
                      onClick={handleBackToFriends}
                      className="hover:bg-white/20 rounded-full p-2 transition-colors flex-shrink-0"
                    >
                      <img src="/icons/backIcon.svg" alt="Back" className="w-6 h-6" />
                    </button>
                    {/* Icon + name/subtitle — tap to open Group Info, mirrors the ⋮ menu's "Group Info" entry */}
                    <button
                      onClick={() => setIsGroupInfoModalOpen(true)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-white/10 rounded-lg -mx-1 px-1 py-0.5 transition-colors"
                      title="Group info"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {selectedGroup.icon ? (
                          <img src={selectedGroup.icon} alt={selectedGroup.name} className="w-full h-full object-cover" />
                        ) : (
                          <UsersIcon className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-base sm:text-lg truncate">{selectedGroup.name}</h3>
                        <p className="text-white/70 text-xs">{selectedGroup.members?.length || 0} members</p>
                      </div>
                    </button>
                    {/* Group call button */}
                    {activeGroupCall?.groupId === selectedGroup.id ? (
                      <button
                        onClick={handleEndGroupCall}
                        className="p-2 text-red-300 hover:bg-white/20 rounded-full transition-all"
                        title="End group call"
                      >
                        <PhoneIcon className="h-6 w-6 rotate-135" />
                      </button>
                    ) : (
                      <button
                        onClick={handleStartGroupCall}
                        className="p-2 text-white hover:bg-white/20 rounded-full transition-all"
                        title="Start group call"
                      >
                        <PhoneIcon className="h-6 w-6" />
                      </button>
                    )}
                    {/* 3-dot menu */}
                    <div className="relative">
                      <button
                        onClick={() => setGroupMenuOpen(prev => !prev)}
                        className="p-2 text-white hover:bg-white/20 rounded-full transition-all"
                        title="Group options"
                      >
                        <EllipsisVerticalIcon className="h-6 w-6" />
                      </button>
                      {groupMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[160px]">
                          <button
                            onClick={() => { setGroupMenuOpen(false); setIsGroupInfoModalOpen(true); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            ℹ️ Group Info
                          </button>
                          <button
                            onClick={handleLeaveGroup}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            🚪 Leave Group
                          </button>
                          {selectedGroup.created_by_id === currentUser?.id && (
                            <button
                              onClick={handleDeleteGroup}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              🗑️ Delete Group
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 sm:space-y-3 bg-gray-50 dark:bg-gray-900 custom-sleek-scrollbar">
                    {(groupMessages[selectedGroup.id] || []).length === 0 ? (
                      <div className="text-center py-6 sm:py-10 text-gray-500 dark:text-gray-400">
                        <p className="text-xs sm:text-sm">No messages yet</p>
                        <p className="text-[10px] sm:text-xs mt-2">Start the group conversation! 👋</p>
                      </div>
                    ) : (
                      (groupMessages[selectedGroup.id] || []).flatMap((msg, index, arr) => {
                        const prevMsg = arr[index - 1];
                        const result = [];
                        if (!prevMsg || !isSameDay(msg.created_at, prevMsg.created_at)) {
                          result.push(
                            <div key={`date-${index}`} className="flex items-center justify-center sticky top-2 z-10 pointer-events-none py-1">
                              <span className="bg-gray-300/80 dark:bg-gray-700/80 backdrop-blur-sm text-gray-600 dark:text-gray-300 text-[11px] font-medium px-3 py-0.5 rounded-full shadow-sm select-none">
                                {formatChatDate(msg.created_at)}
                              </span>
                            </div>
                          );
                        }
                        result.push(
                          <LobbyMessageBubble
                            key={msg.id || index}
                            message={msg}
                            isOwn={msg.sender_id === currentUser?.id}
                            currentUser={currentUser}
                            onEdit={() => {}}
                            onDelete={() => {}}
                            onVotePoll={() => {}}
                            onViewUser={() => {}}
                            liveRooms={liveRooms}
                            endedSessionIds={endedSessionIds}
                            showSenderName={true}
                          />
                        );
                        return result;
                      })
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {/* Group Message Input */}
                  <form onSubmit={handleSendGroupMessage} className="absolute bottom-0 left-0 right-0">
                    <div className="mb-2 mx-3 relative bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-2">
                      <textarea
                        value={newGroupChatMessage}
                        onChange={(e) => setNewGroupChatMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendGroupMessage(e); }
                        }}
                        placeholder="Message the group…"
                        rows={1}
                        className="w-full bg-transparent border-none outline-none resize-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 text-sm"
                        style={{ minHeight: '20px', maxHeight: '80px' }}
                      />
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setIsAttachModalOpen(true)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                            title="Attach file"
                          >
                            <PaperClipOutlineIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowWatchOutModal(true)}
                            className="rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors relative"
                            title="Send Watch Out"
                          >
                            <span className="relative inline-block h-8 w-8">
                              <img src="/icons/lwoIcon.webp" alt="Watch Out" className="h-8 w-8 object-contain" />
                              {liveRooms.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              )}
                            </span>
                          </button>
                        </div>
                        <button
                          type="submit"
                          disabled={!newGroupChatMessage.trim()}
                          className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white flex items-center justify-center transition-all disabled:cursor-not-allowed shadow-md"
                          title="Send"
                        >
                          <ArrowUpIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : chatView === 'friends' ? (
                /* ========== FRIENDS LIST VIEW ========== */
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col h-full">
                  {/* ✅ Friends List Header */}
                  <div className="bg-gradient-to-r from-green-600 to-green-700 p-3 sm:p-4">
                    <h3 className="text-white font-bold text-lg sm:text-xl mb-3 flex items-center gap-2">
                      Chats
                      {pendingRequests.length > 0 && (
                        <span className="text-xs font-bold bg-purple-500 text-white px-2 py-0.5 rounded-full">
                          +{pendingRequests.length}
                        </span>
                      )}
                    </h3>
                    
                  </div>
                
                {/* Sub-tabs: Friends / Requests */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <button
                    onClick={() => setActiveRequestsTab('friends')}
                    className={`flex-1 px-3 py-2 text-sm sm:text-base transition-colors relative ${
                      activeRequestsTab === 'friends'
                        ? 'font-bold text-green-600 dark:text-green-400'
                        : 'font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    Friends
                    {(() => {
                      const totalGroupUnread = Object.values(groupUnreadCounts).reduce((a, b) => a + b, 0);
                      return totalGroupUnread > 0 ? (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-green-600 text-white rounded-full">
                          {totalGroupUnread > 99 ? '99+' : totalGroupUnread}
                        </span>
                      ) : null;
                    })()}
                    {activeRequestsTab === 'friends' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 dark:bg-green-400"></div>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveRequestsTab('requests')}
                    className={`flex-1 px-3 py-2 text-sm sm:text-base transition-colors relative ${
                      activeRequestsTab === 'requests'
                        ? 'font-bold text-green-600 dark:text-green-400'
                        : 'font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    Requests
                    {(pendingRequests.length + sentRequests.length) > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded-full">
                        {pendingRequests.length + sentRequests.length}
                      </span>
                    )}
                    {activeRequestsTab === 'requests' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 dark:bg-green-400"></div>
                    )}
                  </button>
                </div>
                
                  {/* Global "Add People" results — shown inline when unified search has 2+ chars */}
                  {activeRequestsTab === 'friends' && showChatsSearch && addFriendQuery.trim().length >= 2 && (
                    <div className="border-b border-gray-100 dark:border-gray-700">
                      {addFriendLoading && (
                        <p className="text-xs text-gray-400 text-center py-2">Searching…</p>
                      )}
                      {!addFriendLoading && addFriendResults.length > 0 && (
                        <div className="px-3 py-2 space-y-1">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Add People</p>
                          {addFriendResults.map(user => {
                            const isFriend = friendsList.some(f => f.id === user.id);
                            const sent = sentFriendRequestIds.has(user.id);
                            return (
                              <div key={user.id} className="flex items-center gap-2 py-1">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex-shrink-0 overflow-hidden">
                                  {getAssetUrl(user.avatar_url) ? (
                                    <img src={cdnThumb(getAssetUrl(user.avatar_url), 80)} alt="" className="w-full h-full object-cover" loading="lazy" />
                                  ) : (
                                    <span className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                                      {user.username[0]?.toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{user.username}</span>
                                {isFriend ? (
                                  <span className="text-xs text-gray-400">Friends</span>
                                ) : sent ? (
                                  <span className="text-xs text-green-500">Sent</span>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await sendFriendRequest(user.id);
                                        setSentFriendRequestIds(prev => new Set([...prev, user.id]));
                                        fetchSentRequests();
                                        fetchFriendsList();
                                      } catch {
                                        toast.error('Could not send request');
                                      }
                                    }}
                                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded-full transition-colors"
                                  >
                                    Add
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!addFriendLoading && addFriendResults.length === 0 && (
                        <div className="px-3 py-2">
                          <p className="text-xs text-gray-400 text-center mb-2">No users found for "{addFriendQuery}"</p>
                          <div className="flex gap-1.5">
                            <button
                              onClick={async () => {
                                const inviteUrl = `${window.location.origin}/invite?ref=${currentUser?.id}`;
                                const shareData = { title: 'Join me on LetsWatchOut', text: 'Hey! Join me on LetsWatchOut — the best place to watch together.', url: inviteUrl };
                                if (navigator.share && navigator.canShare?.(shareData)) {
                                  try { await navigator.share(shareData); } catch {}
                                } else {
                                  await navigator.clipboard.writeText(inviteUrl);
                                  toast.success('Invite link copied!');
                                }
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            >
                              <ShareIcon className="w-3.5 h-3.5" />
                              Invite
                            </button>
                            <button
                              onClick={async () => {
                                const inviteUrl = `${window.location.origin}/invite?ref=${currentUser?.id}`;
                                await navigator.clipboard.writeText(inviteUrl);
                                toast.success('Invite link copied!');
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy link
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ✅ Friends Tab Content — groups + DMs merged and sorted by last activity */}
                  {activeRequestsTab === 'friends' && (
                    <div
                      className="overflow-y-auto flex-1 custom-sleek-scrollbar"
                      style={{ scrollbarWidth: 'thin', scrollbarColor: '#10b981 #1f2937' }}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
                          setVisibleChatItemCount(prev =>
                            prev < chatItemsTotalRef.current ? prev + CHAT_LIST_PAGE_SIZE : prev
                          );
                        }
                      }}
                    >
                      {(() => {
                        const searchTerm = friendsSearchTerm.toLowerCase();
                        const collapseGroups = groupsList.length > 10 && !searchTerm;

                        // Build merged item list
                        const items = [];

                        // Groups: inline when ≤ 10 or when searching
                        if (!collapseGroups) {
                          groupsList
                            .filter(g => !searchTerm || g.name.toLowerCase().includes(searchTerm))
                            .forEach(g => items.push({
                              type: 'group',
                              data: g,
                              lastActivity: g.last_message_at ? new Date(g.last_message_at) : new Date(g.created_at || 0),
                            }));
                        }

                        // DMs
                        friendsList
                          .filter(f => !searchTerm || f.username.toLowerCase().includes(searchTerm))
                          .forEach(f => {
                            const lastMsg = lastMessagePreviews[f.id];
                            items.push({
                              type: 'dm',
                              data: f,
                              lastActivity: lastMsg ? new Date(lastMsg.timestamp) : new Date(0),
                            });
                          });

                        // Sort by most recent first
                        items.sort((a, b) => b.lastActivity - a.lastActivity);

                        const isEmpty = items.length === 0 && (!collapseGroups || groupsList.length === 0);

                        // Windowed reveal — the full merged list is already in memory (needed
                        // elsewhere for correctness), this just caps how many rows render at
                        // once. More rows reveal instantly as the user scrolls (see onScroll
                        // above) — no extra network round-trip involved.
                        chatItemsTotalRef.current = items.length;
                        const visibleItems = items.slice(0, visibleChatItemCount);

                        return (
                          <>
                            {/* Collapsed groups card (> 10, no active search) */}
                            {collapseGroups && (
                              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/50">
                                <button
                                  onClick={() => setIsGroupsCardExpanded(prev => !prev)}
                                  className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                                >
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-green-500 flex items-center justify-center flex-shrink-0">
                                    <UsersIcon className="w-4 h-4 text-white" />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                                      {groupsList.length} Groups
                                    </p>
                                    <p className="text-xs text-purple-500 dark:text-purple-400">
                                      {isGroupsCardExpanded ? 'Click to collapse' : 'Click to expand'}
                                    </p>
                                  </div>
                                  <svg
                                    className={`w-5 h-5 text-purple-600 dark:text-purple-400 transition-transform ${isGroupsCardExpanded ? 'rotate-180' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {isGroupsCardExpanded && groupsList.map(group => {
                                  const unread = groupUnreadCounts[group.id] || 0;
                                  const memberCount = group.members?.length || 0;
                                  return (
                                    <div
                                      key={group.id}
                                      onClick={() => handleOpenGroup(group)}
                                      className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700/50"
                                    >
                                      <div
                                        className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-green-500 flex items-center justify-center flex-shrink-0 relative overflow-hidden"
                                        onClick={group.icon ? (e) => { e.stopPropagation(); setExpandedGroupIcon({ url: group.icon, name: group.name }); } : undefined}
                                      >
                                        {group.icon ? (
                                          <img src={group.icon} alt={group.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <UsersIcon className="w-6 h-6 text-white" />
                                        )}
                                        {unread > 0 && (
                                          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                            {unread > 9 ? '9+' : unread}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between mb-1">
                                          <p className="font-semibold text-base text-gray-900 dark:text-white truncate">{group.name}</p>
                                          {group.last_message_at && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                                              {new Date(group.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          )}
                                        </div>
                                        <p className={`text-sm truncate ${unread > 0 ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                          {group.last_message ? (group.last_message.length > 40 ? group.last_message.slice(0, 40) + '…' : group.last_message) : `${memberCount} member${memberCount !== 1 ? 's' : ''}`}
                                        </p>
                                      </div>
                                      {unread > 0 && (
                                        <div className="bg-green-600 text-white text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-2 flex-shrink-0">
                                          {unread > 99 ? '99+' : unread}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Empty state */}
                            {isEmpty && (
                              <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                                {searchTerm ? (
                                  <>
                                    <p className="text-sm">No results found</p>
                                    <p className="text-xs mt-2">Try a different search</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm">No friends yet</p>
                                    <p className="text-xs mt-2 px-4">Accept friend requests to start chatting!</p>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Merged sorted list */}
                            {visibleItems.map(item => {
                              if (item.type === 'group') {
                                const group = item.data;
                                const unread = groupUnreadCounts[group.id] || 0;
                                const memberCount = group.members?.length || 0;
                                return (
                                  <div
                                    key={`group-${group.id}`}
                                    onClick={() => handleOpenGroup(group)}
                                    className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700/50"
                                  >
                                    <div
                                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-purple-500 to-green-500 flex items-center justify-center flex-shrink-0 relative overflow-hidden"
                                      onClick={group.icon ? (e) => { e.stopPropagation(); setExpandedGroupIcon({ url: group.icon, name: group.name }); } : undefined}
                                    >
                                      {group.icon ? (
                                        <img src={group.icon} alt={group.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <UsersIcon className="w-6 h-6 text-white" />
                                      )}
                                      {unread > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                          {unread > 9 ? '9+' : unread}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-baseline justify-between mb-1">
                                        <p className="font-semibold text-base text-gray-900 dark:text-white truncate">{group.name}</p>
                                        {group.last_message_at && (
                                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                                            {new Date(group.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        )}
                                      </div>
                                      <p className={`text-sm truncate ${unread > 0 ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                        {group.last_message ? (group.last_message.length > 40 ? group.last_message.slice(0, 40) + '…' : group.last_message) : `${memberCount} member${memberCount !== 1 ? 's' : ''}`}
                                      </p>
                                    </div>
                                    {unread > 0 && (
                                      <div className="bg-green-600 text-white text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-2 flex-shrink-0">
                                        {unread > 99 ? '99+' : unread}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // DM friend card
                              const friend = item.data;
                              const unreadCount = unreadCounts[friend.id] || 0;
                              const lastMsg = lastMessagePreviews[friend.id];
                              const isOnline = onlineStatus[friend.id];
                              return (
                                <div key={`dm-${friend.id}`} className="relative group friend-menu-container">
                                  <button
                                    onClick={() => handleOpenChat(friend)}
                                    className="w-full p-3 sm:p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700"
                                  >
                                    <div className="relative flex-shrink-0">
                                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden ring-2 ring-white dark:ring-gray-800">
                                        <Avatar
                                          user={friend}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setLightboxAvatarUser(friend);
                                          }}
                                          className="w-full h-full object-cover cursor-pointer"
                                        />
                                      </div>
                                      {isOnline && (
                                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                                      )}
                                    </div>
                                    <div className="flex-1 text-left min-w-0 pr-2">
                                      <div className="flex items-baseline justify-between mb-1">
                                        <p className="font-semibold text-base text-gray-900 dark:text-white truncate">
                                          {friend.username}
                                        </p>
                                        {lastMsg && (
                                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                                            {new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        )}
                                      </div>
                                      {lastMsg && (
                                        <p className={`text-sm truncate ${unreadCount > 0 ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                          {lastMsg.isOwn && (
                                            <span className="text-green-600 dark:text-green-400 mr-1">
                                              <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                              </svg>
                                            </span>
                                          )}
                                          {lastMsg.text}
                                        </p>
                                      )}
                                    </div>
                                    {unreadCount > 0 && (
                                      <div className="bg-green-600 text-white text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-2 flex-shrink-0">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                      </div>
                                    )}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFriendMenuOpen(friendMenuOpen === friend.id ? null : friend.id);
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Options"
                                  >
                                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                                      <circle cx="12" cy="5" r="2"/>
                                      <circle cx="12" cy="12" r="2"/>
                                      <circle cx="12" cy="19" r="2"/>
                                    </svg>
                                  </button>
                                  {friendMenuOpen === friend.id && (
                                    <div className="absolute right-2 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[150px]">
                                      <button
                                        onClick={() => { setFriendMenuOpen(null); handleRemoveFriend(friend.id); }}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      >
                                        🚫 Unfriend
                                      </button>
                                      <button
                                        onClick={() => { setFriendMenuOpen(null); handleBlockUser(friend.id); }}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      >
                                        ⛔ Block User
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                
                {/* Requests Tab Content */}
                {activeRequestsTab === 'requests' && (
                  <div 
                    className="overflow-y-auto flex-1 custom-sleek-scrollbar"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#10b981 #1f2937',
                    }}
                  >
                    {/* Received Requests Section */}
                    <div className="mb-4">
                      <div className="sticky top-0 bg-gray-100 dark:bg-gray-700 px-3 py-2 border-b border-gray-300 dark:border-gray-600">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">📥 Received ({pendingRequests.length})</h4>
                      </div>
                      {pendingRequests.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                          <p className="text-[10px] sm:text-xs">No incoming requests</p>
                        </div>
                      ) : (
                        pendingRequests.map(request => {
                          const requester = request.requester || request.Requester;
                          return (
                            <div
                              key={request.id || request.ID}
                              className="p-2 sm:p-4 flex items-center gap-2 sm:gap-3 border-b border-gray-200 dark:border-gray-700"
                            >
                              {/* Avatar */}
                              <Avatar
                                user={requester}
                                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-green-500"
                              />
                              
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                                  {requester.username}
                                </p>
                                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                  wants to be friends
                                </p>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                                <button
                                  onClick={() => handleAcceptRequest(requester.id || requester.ID)}
                                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => handleRejectRequest(requester.id || requester.ID)}
                                  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Sent Requests Section */}
                    <div>
                      <div className="sticky top-0 bg-gray-100 dark:bg-gray-700 px-3 py-2 border-b border-gray-300 dark:border-gray-600">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">📤 Sent ({sentRequests.length})</h4>
                      </div>
                      {sentRequests.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                          <p className="text-[10px] sm:text-xs">No outgoing requests</p>
                        </div>
                      ) : (
                        sentRequests.map(request => {
                          const recipient = request.recipient || request.Recipient;
                          return (
                            <div
                              key={request.id || request.ID}
                              className="p-2 sm:p-4 flex items-center gap-2 sm:gap-3 border-b border-gray-200 dark:border-gray-700"
                            >
                              {/* Avatar */}
                              <Avatar
                                user={recipient}
                                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-blue-500"
                              />
                              
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                                  {recipient.username}
                                </p>
                                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                  ⏳ Awaiting response
                                </p>
                              </div>
                              
                              {/* Status Badge */}
                              <div className="flex-shrink-0">
                                <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1 rounded text-[10px] sm:text-xs font-medium">
                                  Pending
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              ) : (
                /* ========== MESSAGES VIEW ========== */
                <div
                  className="bg-white dark:bg-gray-800 shadow-lg overflow-hidden flex flex-col h-full relative"
                  onTouchStart={handleChatTouchStart}
                  onTouchMove={handleChatTouchMove}
                  onTouchEnd={handleChatTouchEnd}
                >
                  {selectedChatUser && (
                    <>
                      {/* ✅ Messages Header with Back Button */}
                      <div className="bg-gradient-to-r from-green-600 to-green-700 p-3 sm:p-4 flex items-center gap-3">
                        {/* Back Button */}
                        <button
                          onClick={handleBackToFriends}
                          className="hover:bg-white/20 rounded-full p-2 transition-colors flex-shrink-0"
                          title="Back to friends"
                        >
                          <img src="/icons/backIcon.svg" alt="Back" className="w-6 h-6" />
                        </button>
                        
                        {/* Friend Avatar (clickable lightbox) */}
                        <Avatar
                          user={selectedChatUser}
                          onClick={() => setLightboxAvatarUser(selectedChatUser)}
                          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover ring-2 ring-white/30 flex-shrink-0 cursor-pointer"
                        />
                        
                        {/* Friend Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-base sm:text-lg truncate">{selectedChatUser.username}</h3>
                          {onlineStatus[selectedChatUser.id] && (
                            <p className="text-white/80 text-xs">● Online</p>
                          )}
                        </div>
                        
                        {/* Call Button */}
                        <button
                          onClick={() => initiateCall(selectedChatUser)}
                          className="p-2 text-white hover:bg-white/20 rounded-full transition-all active:scale-90 flex-shrink-0"
                          title="Voice call"
                        >
                          <PhoneIcon className="h-6 w-6" />
                        </button>
                        {/* 3-dot menu */}
                        <div className="chat-options-menu relative flex-shrink-0">
                          <button
                            onClick={() => setChatMenuOpen(prev => !prev)}
                            className="p-2 text-white hover:bg-white/20 rounded-full transition-all active:scale-90"
                            title="More options"
                          >
                            <EllipsisVerticalIcon className="h-6 w-6" />
                          </button>
                          {chatMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 py-1 min-w-[160px] z-50">
                              <button
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                                onClick={() => { setChatMenuOpen(false); setChatProfileUser(selectedChatUser); }}
                              >
                                <UserIcon className="w-4 h-4" /> View Profile
                              </button>
                              <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />
                              <button
                                className="w-full text-left px-4 py-2.5 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center gap-2.5 transition-colors"
                                onClick={() => { setChatMenuOpen(false); setReportTarget({ targetType: 'user', targetId: selectedChatUser.id, targetName: selectedChatUser.username }); }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
                                Report User
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    
                    {/* Messages */}
                    <div
                      className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 sm:space-y-3 bg-gray-50 dark:bg-gray-900 custom-sleek-scrollbar"
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#10b981 #111827',
                      }}
                    >
                      {chatMessages[selectedChatUser.id]?.length === 0 ? (
                        <div className="text-center py-6 sm:py-10 text-gray-500 dark:text-gray-400">
                          <p className="text-xs sm:text-sm">No messages yet</p>
                          <p className="text-[10px] sm:text-xs mt-2">Say hi to start the conversation! 👋</p>
                        </div>
                      ) : (
                        (chatMessages[selectedChatUser.id] || []).flatMap((msg, index, arr) => {
                          const prevMsg = arr[index - 1];
                          const result = [];
                          if (!prevMsg || !isSameDay(msg.created_at, prevMsg.created_at)) {
                            result.push(
                              <div key={`date-${index}`} className="flex items-center justify-center sticky top-2 z-10 pointer-events-none py-1">
                                <span className="bg-gray-300/80 dark:bg-gray-700/80 backdrop-blur-sm text-gray-600 dark:text-gray-300 text-[11px] font-medium px-3 py-0.5 rounded-full shadow-sm select-none">
                                  {formatChatDate(msg.created_at)}
                                </span>
                              </div>
                            );
                          }
                          result.push(
                            <LobbyMessageBubble
                              key={msg.id || index}
                              message={msg}
                              isOwn={msg.sender_id === currentUser?.id}
                              currentUser={currentUser}
                              onEdit={handleEditMessage}
                              onDelete={handleDeleteMessage}
                              onVotePoll={handleVotePoll}
                              onViewUser={() => setLightboxAvatarUser(selectedChatUser)}
                              onReply={(msg) => { setReplyingTo(msg); setTimeout(() => document.querySelector('textarea[placeholder="What do wanna do today?"]')?.focus(), 50); }}
                              liveRooms={liveRooms}
                              endedSessionIds={endedSessionIds}
                            />
                          );
                          return result;
                        })
                      )}
                      <div ref={chatMessagesEndRef} />
                    </div>
                    
                    {/* Message Input - Enhanced with Voice, Attachments, Stickers, Polls */}
                    {isRecording ? (
                      /* Voice Recording Mode */
                      <div className="flex-shrink-0">
                        <div className="m-4 p-4 bg-red-50 dark:bg-red-900/30 border-2 border-red-500 rounded-2xl shadow-lg flex items-center gap-3">
                          <div className="flex-1 flex items-center gap-3">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Recording... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                              </p>
                              <div className="w-full bg-red-200 dark:bg-red-800 rounded-full h-1 mt-1">
                                <div 
                                  className="bg-red-500 h-1 rounded-full transition-all"
                                  style={{ width: `${(recordingDuration / 60) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={cancelRecording}
                            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={stopRecording}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Redesigned Message Input - Modern Chat UI */
                      <form onSubmit={handleSendChatMessage} className="flex-shrink-0">
                        <div className="mb-2 mx-3 relative bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-2">
                          {/* Reply strip */}
                          {replyingTo && (
                            <div className="flex items-start gap-2 mb-2 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl border-l-2 border-purple-500">
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-semibold text-purple-500 mb-0.5">
                                  {replyingTo.sender_id === currentUser?.id ? 'You' : selectedChatUser?.username}
                                </p>
                                <TwemojiText as="p" className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{replyingTo.message}</TwemojiText>
                              </div>
                              <button
                                type="button"
                                onClick={() => setReplyingTo(null)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0 p-0.5"
                              >
                                <XMarkIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {/* Text Input */}
                          <textarea
                            value={newChatMessage}
                            onChange={(e) => setNewChatMessage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendChatMessage(e);
                              }
                            }}
                            placeholder="What do wanna do today?"
                            rows={1}
                            className="w-full bg-transparent border-none outline-none resize-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 text-sm"
                            style={{ minHeight: '20px', maxHeight: '80px' }}
                          />
                          
                          {/* Action Icons Row + Send Button */}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                            {/* Left: Action Icons */}
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={startRecording}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Record voice note"
                              >
                                <MicrophoneOutlineIcon className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsStickerPickerOpen(true)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Send emoji/sticker"
                              >
                                <FaceSmileOutlineIcon className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsAttachModalOpen(true)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Attach file"
                              >
                                <PaperClipOutlineIcon className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsPollCreatorOpen(true)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Create poll"
                              >
                                <ChartBarSquareOutlineIcon className="h-5 w-5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowWatchOutModal(true)}
                                className="rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors relative"
                                title="Send Watch Out"
                              >
                                <span className="relative inline-block h-8 w-8">
                                  <img src="/icons/lwoIcon.webp" alt="Watch Out" className="h-8 w-8 object-contain" />
                                  {liveRooms.length > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                  )}
                                </span>
                              </button>
                            </div>
                            
                            {/* Right: Circular Send Button */}
                            <button
                              type="submit"
                              disabled={!newChatMessage.trim()}
                              className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white flex items-center justify-center transition-all disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                              title="Send message"
                            >
                              <ArrowUpIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      </div>

      {/* ✅ WatchOut Modal — DM */}
      {showWatchOutModal && selectedChatUser && chatView === 'messages' && (
        <WatchOutModal
          recipientUser={selectedChatUser}
          onClose={() => setShowWatchOutModal(false)}
          onSent={() => {
            fetchChatMessages(selectedChatUser.id);
          }}
        />
      )}

      {/* ✅ WatchOut Modal — Group */}
      {showWatchOutModal && selectedGroup && chatView === 'group_messages' && (
        <WatchOutModal
          groupMode
          onClose={() => setShowWatchOutModal(false)}
          onSelectRoom={(roomId) => handleGroupWatchOut(roomId)}
          liveRooms={liveRooms}
        />
      )}

      {/* ✅ Incoming Group Call Banner */}
      {incomingGroupCall && !activeGroupCall && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9998] bg-gray-900 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-4 min-w-[280px] max-w-[360px] border border-purple-500">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-green-500 flex items-center justify-center flex-shrink-0">
            <UsersIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{incomingGroupCall.group_name}</p>
            <p className="text-xs text-gray-300 truncate">
              {incomingGroupCall.initiator_username} started a Group Call
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleJoinGroupCall(
                incomingGroupCall.group_id,
                incomingGroupCall.room_name,
                incomingGroupCall.livekit_url,
                incomingGroupCall.group_name
              )}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-full transition-colors"
            >
              Join
            </button>
            <button
              onClick={() => setIncomingGroupCall(null)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-full transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ✅ Create Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-[9997] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">New Group Chat</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name…"
              maxLength={100}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-3 outline-none focus:border-green-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Add members:</p>
            <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
              {friendsList.map(friend => {
                const selected = selectedMembersForGroup.includes(friend.id);
                return (
                  <label key={friend.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        setSelectedMembersForGroup(prev =>
                          selected ? prev.filter(id => id !== friend.id) : [...prev, friend.id]
                        );
                      }}
                      className="accent-green-600"
                    />
                    <Avatar user={friend} className="w-7 h-7 rounded-full" />
                    <span className="text-sm text-gray-900 dark:text-white">{friend.username}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCreateGroupModal(false); setNewGroupName(''); setSelectedMembersForGroup([]); }}
                className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || selectedMembersForGroup.length === 0}
                className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Chat Enhancement Modals */}
      {selectedChatUser && chatView === 'messages' && (
        <>
          <LobbyAttachModal
            isOpen={isAttachModalOpen}
            onClose={() => setIsAttachModalOpen(false)}
            onSend={handleSendAttachment}
            recipientId={selectedChatUser.id}
          />
          <LobbyStickerPicker
            isOpen={isStickerPickerOpen}
            onClose={() => setIsStickerPickerOpen(false)}
            onSend={handleSendSticker}
            recipientId={selectedChatUser.id}
          />
          <LobbyPollCreator
            isOpen={isPollCreatorOpen}
            onClose={() => setIsPollCreatorOpen(false)}
            onSend={handleSendPoll}
            recipientId={selectedChatUser.id}
          />
        </>
      )}

      {/* ✅ Group Attach Modal */}
      {selectedGroup && chatView === 'group_messages' && (
        <LobbyAttachModal
          isOpen={isAttachModalOpen}
          onClose={() => setIsAttachModalOpen(false)}
          onSend={handleGroupAttachment}
          recipientId={0}
        />
      )}

      {/* ✅ Ticket Purchase Modal */}
      {isTicketModalOpen && selectedSessionForTicket && (
        <TicketPurchaseModal
          isOpen={isTicketModalOpen}
          onClose={() => {
            setIsTicketModalOpen(false);
            setSelectedSessionForTicket(null);
          }}
          session={{
            id: selectedSessionForTicket.session_id,
            session_id: selectedSessionForTicket.session_id,
            watch_type: selectedSessionForTicket.watch_type,
            class_type: selectedSessionForTicket.class_type,
            host_username: selectedSessionForTicket.host_username,
            host_name: selectedSessionForTicket.host_name,
            started_at: selectedSessionForTicket.started_at,
            ticket_price_tokens: selectedSessionForTicket.ticket_price_tokens,
            early_bird_enabled: selectedSessionForTicket.early_bird_enabled,
            early_bird_active: selectedSessionForTicket.early_bird_active,
            early_bird_price_tokens: selectedSessionForTicket.early_bird_price_tokens,
            ticketing_enabled: selectedSessionForTicket.ticketing_enabled
          }}
          onSuccess={() => handleTicketPurchaseSuccess(selectedSessionForTicket.session_id)}
        />
      )}
      
      {/* ✅ Calendar Modal for Trailers */}
      {isCalendarModalOpen && selectedEventForCalendar && (
        <CalendarModal
          isOpen={isCalendarModalOpen}
          onClose={() => {
            setIsCalendarModalOpen(false);
            setSelectedEventForCalendar(null);
          }}
          event={selectedEventForCalendar}
          roomUrl={`${window.location.origin}/rooms/${selectedEventForCalendar.room_id}`}
        />
      )}

      {/* ✅ Post View Modal */}
      <PostViewModal
        isOpen={isPostViewModalOpen}
        onClose={() => {
          setIsPostViewModalOpen(false);
          setSelectedPost(null);
        }}
        post={selectedPost}
        onLikeToggle={() => {}}
        onCommentAdded={() => {}}
      />

      {/* Call History Modal (opened from taskbar calls button on chats tab) */}
      <CallHistoryModal
        isOpen={isCallHistoryModalOpen}
        onClose={() => setIsCallHistoryModalOpen(false)}
        currentUser={currentUser}
        onCallUser={initiateCall}
      />

      {/* ✅ Call Modals */}
      <OutgoingCallModal
        isOpen={!!outgoingCall}
        friend={outgoingCall?.user}
        callStatus={outgoingCall?.status}
        onCancel={cancelOutgoingCall}
      />

      <IncomingCallModal
        isOpen={!!incomingCall}
        caller={incomingCall?.user}
        onAccept={acceptCall}
        onDecline={declineCall}
      />

      <ActiveCallInterface
        isOpen={!!activeCall}
        friend={activeCall?.user}
        room={activeCall?.room}
        livekitRoom={callRoom}
        onEndCall={handleEndCall}
        localParticipant={callRoom?.localParticipant}
        remoteParticipant={callRoom?.participants ? Array.from(callRoom.participants.values())[0] : null}
      />

      {/* ✅ Fullscreen Watching Now Modal */}
      {isWatchingNowFullscreen && (
        <div 
          className="fixed inset-0 z-[9999] bg-black fullscreen-scroll"
          style={{
            scrollSnapType: 'y mandatory',
            overflowY: 'scroll',
            height: '100vh',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
          ref={fullscreenScrollRef}
        >
          {/* Hide scrollbar */}
          <style>{`
            .fullscreen-scroll::-webkit-scrollbar {
              display: none;
            }
            @keyframes slideUp {
              from {
                transform: translateY(100%);
                opacity: 0;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
            .animate-slide-up {
              animation: slideUp 0.3s ease-out forwards;
            }
          `}</style>

          {/* Close Button */}
          <button
            onClick={handleCloseFullscreen}
            className="fixed top-6 right-6 z-[10000] bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-colors backdrop-blur-sm"
            title="Exit fullscreen (ESC)"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Trailers */}
          {trailersPage.data.map((trailer, index) => (
            <div 
              key={`fullscreen-trailer-${trailer.ID}`}
              className="relative w-screen h-screen flex-shrink-0"
              style={{ 
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always'
              }}
            >
              {/* Trailer media */}
              {isImageUrl(trailer.trailer_url) ? (
                <img
                  src={resolvePreviewUrl(trailer.trailer_url)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={resolvePreviewUrl(trailer.trailer_url)}
                  autoPlay loop muted playsInline
                  className="w-full h-full object-cover"
                />
              )}
              
              {/* Gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 pointer-events-none"></div>
              
              {/* Top Left: Coming Soon Stamp + Room Name */}
              <div className="absolute top-6 left-6 z-10">
                <div className="relative mb-3">
                  <div className="bg-red-600/30 backdrop-blur-sm border-4 border-red-500/50 text-red-100 px-6 py-3 transform -rotate-12 shadow-2xl">
                    <div className="text-2xl font-black tracking-wider" style={{ fontFamily: 'Impact, Arial Black, sans-serif', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                      COMING SOON
                    </div>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  {trailer.Room?.name || 'Event Room'}
                </h3>
              </div>
              
              {/* Bottom: Event Details + Add to Calendar Button */}
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <h4 className="text-2xl font-bold mb-2 drop-shadow-lg">{trailer.trailer_title || trailer.title}</h4>
                <p className="text-sm text-gray-200 mb-3 drop-shadow-md">{trailer.description}</p>
                <div className="flex items-center justify-between">
                  <p className="text-sm drop-shadow-md">
                    <span className="text-gray-300">Starts:</span> <span className="font-semibold">{new Date(trailer.start_time).toLocaleString()}</span>
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEventForCalendar(trailer);
                      setIsCalendarModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg font-medium transition-colors shadow-lg"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Add to Calendar
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Live Sessions */}
          {sessionsPage.data.map((session, index) => {
            const preview = sessionPreviews[session.session_id] || {};
            
            const watchTypeConfig = {
              'classroom': { emoji: '🎓', name: 'Classroom', color: 'green' },
              '3d_cinema': { emoji: '🎭', name: '3D Cinema', color: 'blue' },
              'video': { emoji: '🎬', name: 'Video Watch', color: 'purple' }
            };
            const watchType = watchTypeConfig[session.watch_type] || watchTypeConfig['video'];
            
            // Check if this session has active chat (70-30 split mode)
            const isChatActive = activeChatSession?.session_id === session.session_id;
            
            // Determine chat title based on watch type
            const chatTitle = session.watch_type === 'classroom' && session.class_type === 'lecture_hall'
              ? 'Class Chat'
              : 'WatchOut Chat';

            return (
              <div 
                key={`fullscreen-session-${session.session_id}`}
                className="relative w-screen h-screen flex-shrink-0 flex flex-col"
                style={{ 
                  scrollSnapAlign: 'start',
                  scrollSnapStop: 'always'
                }}
                onClick={(e) => {
                  // Close chat if clicking outside chat widget
                  if (isChatActive && e.target === e.currentTarget) {
                    handleCloseChatPreview();
                  }
                }}
              >
                {/* Video Preview Area (100% height normally, 30% when chat active) */}
                <div 
                  className={`relative ${isChatActive ? 'h-[30%]' : 'h-full'} transition-all duration-300`}
                  onClick={() => {
                    // Tap video to close chat
                    if (isChatActive) {
                      handleCloseChatPreview();
                    }
                  }}
                >
                  {/* Preview Background */}
                  <div className="absolute inset-0">
                    <SessionPreview
                      session={session}
                      previewUrl={preview.previewUrl}
                      posterUrl={preview.posterUrl}
                      isGenerating={preview.isGenerating}
                      isClearing={preview.isClearing || false}
                      muted={false}
                      previewVersion={preview.version}
                    />
                    <LiveShareOverlay session={session} />
                  </div>

                  {/* Dark Gradient Overlay (only when chat NOT active) */}
                  {!isChatActive && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>
                  )}
                </div>
                
                {/* Chat Widget (70% height, slides up from bottom) */}
                {isChatActive && (
                  <div 
                    className="h-[70%] bg-black/80 backdrop-blur-md border-t border-gray-700 flex flex-col animate-slide-up"
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={handleChatTouchStart}
                    onTouchMove={handleChatTouchMove}
                    onTouchEnd={handleChatTouchEnd}
                  >
                    {/* Chat Header */}
                    <div className="flex justify-between items-center p-3 border-b border-gray-700 flex-shrink-0">
                      <h3 className="text-white font-medium">{chatTitle}</h3>
                      <button 
                        onClick={handleCloseChatPreview}
                        className="text-gray-400 hover:text-white text-2xl leading-none"
                      >
                        ×
                      </button>
                    </div>
                    
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {isChatConnecting ? (
                        <div className="text-gray-500 text-sm text-center py-4">Connecting...</div>
                      ) : sessionChatMessages.length === 0 ? (
                        <div className="text-gray-500 text-sm text-center py-4">Be the first to chat!</div>
                      ) : (
                        sessionChatMessages.map((msg, idx) => (
                          <div 
                            key={msg.ID || idx}
                            className="text-sm"
                          >
                            <div className="flex items-start gap-2">
                              <span className="font-semibold text-purple-400">{msg.Username}:</span>
                              <span className="text-gray-200">{msg.Message}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    
                    {/* Read-Only Notice (No Input Field) */}
                    <div className="p-3 border-t border-gray-700 flex-shrink-0">
                      <div className="text-center text-sm text-gray-400 italic">
                        Join the session to send messages
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Original UI (only show when chat NOT active) */}
                {!isChatActive && (
                  <>
                {/* Dark Gradient Overlay for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>
                
                {/* TikTok-style Minimalist Info Overlay */}
                <div 
                  className="absolute bottom-24 left-6 right-6 text-white pointer-events-auto"
                  style={{ fontFamily: '"Outfit", -apple-system, "Segoe UI", sans-serif' }}
                >
                  {/* Row 1: Room Avatar + Name & Star + Content Rating */}
                  <div className="flex items-center gap-3 mb-3">
                    {/* Room Avatar with Live Ring */}
                    <div 
                      onClick={!session.is_temporary ? (e) => {
                        e.stopPropagation();
                        navigate(`/rooms/${session.room_id}`);
                      } : undefined}
                      className={`relative flex-shrink-0 ${
                        !session.is_temporary ? 'cursor-pointer group' : ''
                      }`}
                    >
                      {/* Subtle expanding ring (background) */}
                      <div className="absolute -inset-1.5 rounded-full bg-red-500/30 animate-ping"></div>
                      
                      {/* Pulsing red ring overlay */}
                      <div className="absolute inset-0 w-12 h-12 rounded-full ring-[3px] ring-red-500 animate-pulse pointer-events-none" style={{ animationDuration: '2s' }}></div>
                      
                      {/* Avatar (stable, no pulse) */}
                      <div className={`relative w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg overflow-hidden transition-transform ${
                        !session.is_temporary ? 'group-hover:scale-110' : ''
                      }`}>
                        {session.room_avatar_url ? (
                          <img src={cdnThumb(getAssetUrl(session.room_avatar_url), 80)} alt={session.room_name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          session.room_name?.[0]?.toUpperCase() || 'R'
                        )}
                      </div>
                      {!session.is_temporary && !session.is_member && session.host_id !== currentUser?.id && (
                        joinedRooms[session.room_id]
                          ? <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-10 pointer-events-none">
                              <span className="text-white text-[9px] font-black leading-none">✓</span>
                            </div>
                          : <button onClick={(e) => { e.stopPropagation(); handleJoinRoomFromCard(session.room_id, e); }} className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 hover:bg-green-400 rounded-full flex items-center justify-center shadow-md z-10 transition-transform active:scale-90">
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" className="w-3 h-3"><path d="M12 2v20M2 12h20" /></svg>
                            </button>
                      )}
                    </div>

                    {/* Room Name + Star Rating */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className="font-bold text-white text-lg truncate"
                        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                      >
                        {session.room_name}
                      </span>
                      {/* Star Rating (Inline with room name) */}
                      {session.average_rating > 0 && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <svg className="w-4 h-4 fill-yellow-400" viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                          <span className="text-white font-bold text-sm" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                            {session.average_rating.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Row 2: Title */}
                  <div className="mb-2">
                    {/* Title */}
                    <h3
                      className="text-white text-2xl font-bold leading-tight line-clamp-2"
                      style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
                    >
                      {session.session_title || session.currently_playing || 'Live Session'}
                    </h3>
                  </div>
                  
                  {/* Row 3: Expandable "... more" */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const target = e.currentTarget;
                      const detailsDiv = target.nextElementSibling;
                      const isExpanded = detailsDiv.style.display === 'block';
                      detailsDiv.style.display = isExpanded ? 'none' : 'block';
                      target.textContent = isExpanded ? '... more' : '... less';
                    }}
                    className="text-base text-gray-300 hover:text-white transition-colors mb-1"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                  >
                    ... more
                  </button>
                  
                  {/* Expanded Details */}
                  <div 
                    className="text-base text-gray-200 space-y-1"
                    style={{ display: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1.5">
                        <UserIcon className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                        <span className="font-medium">{session.host_username}</span>
                      </span>
                      {session.ticketing_enabled && (
                        <span className="inline-flex items-center gap-1.5 text-yellow-300 font-semibold">
                          <span>🪙</span>
                          <span>Paid</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Right Icon Stack - TikTok Style (Fullscreen) */}
                <div className="absolute bottom-24 right-6 flex flex-col items-center gap-6 pointer-events-auto">
                  {/* Content Rating */}
                  {session.content_rating && (
                    session.content_rating === 'Educational' ? (
                      <img src="/icons/E.webp" alt="Educational" className="w-11 h-11 object-contain" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }} />
                    ) : session.content_rating === 'Religious' ? (
                      <img src="/icons/R.png" alt="Religious" className="w-11 h-11 object-contain" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }} />
                    ) : (
                      <span className="text-white font-black text-4xl leading-none" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)' }}>
                        {session.content_rating === 'Mature' ? 'M' : session.content_rating}
                      </span>
                    )
                  )}
                  
                  {/* Likes */}
                  <button
                    onClick={(e) => handleSessionLike(session.session_id, e)}
                    className="flex flex-col items-center gap-1.5 group transition-transform hover:scale-110"
                  >
                    <HeartIcon
                      key={`heart-full-${session.session_id}-${!!sessionLikes[session.session_id]?.isLiked}`}
                      className={`w-11 h-11 ${sessionLikes[session.session_id]?.isLiked ? 'text-red-500 [animation:heartPop_0.4s_ease]' : 'text-white'}`}
                      style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}
                    />
                    <span className="text-white text-base font-bold" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                      {formatCount(sessionLikes[session.session_id]?.count || 0)}
                    </span>
                  </button>
                  
                  {/* Chat */}
                  <button
                    onClick={(e) => handleOpenChatPreview(session, e)}
                    className="flex flex-col items-center gap-1.5 group transition-transform hover:scale-110"
                  >
                    <ChatBubbleOvalLeftEllipsisIcon className="w-11 h-11 text-white" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }} />
                    <span className="text-white text-base font-bold" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                      {formatCount(sessionChatCounts[session.session_id] || 0)}
                    </span>
                  </button>
                  
                  {/* Members */}
                  <div className="flex flex-col items-center gap-1.5">
                    <img src="/icons/view.png" alt="viewers" className="w-11 h-11 object-contain" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }} />
                    <span className="text-white text-base font-bold" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                      {formatCount(session.member_count || 0)}
                    </span>
                  </div>

                  {/* Favourite */}
                  {!session.is_temporary && (
                    <button onClick={(e) => handleToggleFavourite(session.room_id, e)} className="flex flex-col items-center gap-1.5 transition-transform active:scale-90">
                      {savedRooms[session.room_id]
                        ? <BookmarkIcon className="w-11 h-11 text-purple-400" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }} />
                        : <svg viewBox="0 0 24 24" fill="white" className="w-11 h-11" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}>
                            <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z M11 7L13 7L13 9L15 9L15 11L13 11L13 13L11 13L11 11L9 11L9 9L11 9Z" />
                          </svg>
                      }
                    </button>
                  )}

                  {/* Share */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleShareRoom(session.room_id, session.room_name || session.title || 'Room'); }}
                    className="flex flex-col items-center gap-1.5 transition-transform active:scale-90"
                  >
                    <ShareIcon className="w-11 h-11 text-white" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }} />
                  </button>
                </div>

                {/* Sleek Join Now Button - Fixed Bottom Center */}
                <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 pointer-events-auto">
                  <button
                    onClick={() => handleJoinSessionDirect(session)}
                    className="px-10 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full font-bold text-lg hover:from-purple-500 hover:to-blue-500 transform hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3"
                    style={{ 
                      fontFamily: '"Outfit", -apple-system, "Segoe UI", sans-serif',
                      boxShadow: '0 8px 32px rgba(147, 51, 234, 0.5)'
                    }}
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                    </svg>
                    {session.ticketing_enabled && session.ticket_price_tokens > 0 ? 'Purchase & Join' : 'Join Now'}
                  </button>
                  
                  {/* Show price if paid session */}
                  {session.ticketing_enabled && session.ticket_price_tokens > 0 && (
                    <div className="flex items-center gap-2 bg-yellow-500/20 backdrop-blur-md px-5 py-2.5 rounded-full border border-yellow-400/50">
                      <img src="/icons/coins.svg" alt="Tokens" className="w-5 h-5" />
                      <span className="text-yellow-300 font-bold text-base">
                        {session.early_bird_active && session.early_bird_enabled 
                          ? session.early_bird_price_tokens 
                          : session.ticket_price_tokens} tokens
                      </span>
                      {session.early_bird_active && session.early_bird_enabled && (
                        <span className="text-green-300 text-xs font-semibold bg-green-600/40 px-2.5 py-1 rounded-full">
                          🎉 EARLY BIRD
                        </span>
                      )}
                    </div>
                  )}
                </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* ✅ Date of Birth Prompt Modal (Required for all users) */}
      <DateOfBirthPromptModal
        isOpen={isDOBPromptOpen}
        onSubmit={handleDOBSubmit}
        isSubmitting={isDOBSubmitting}
      />
      
      {/* ❤️ Floating heart animations */}
      <TikTokHeartAnimation
        hearts={heartAnimations}
        onRemove={(id) => setHeartAnimations(prev => prev.filter(h => h.id !== id))}
      />

      {/* 🔍 Avatar Lightbox — opens when a friend avatar is clicked in the chats tab */}
      {lightboxAvatarUser && (
        <div
          className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4"
          onClick={() => setLightboxAvatarUser(null)}
        >
          <button
            onClick={() => setLightboxAvatarUser(null)}
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300"
            aria-label="Close avatar"
          >
            ×
          </button>
          <Avatar
            user={lightboxAvatarUser}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90vw] max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
          />
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-lg font-medium drop-shadow-lg">
            @{lightboxAvatarUser.username}
          </p>
        </div>
      )}

      {/* ✅ FEED TAB CONTENT */}
      {activeTab === 'feed' && (
        <div className="container mx-auto px-4 pt-2">
          <DiscoverFeed
            ref={discoverFeedRef}
            searchQuery={discoverSearch}
            onPostClick={(post) => { setSelectedPost(post); setIsPostViewModalOpen(true); }}
          />
        </div>
      )}

      {/* 📅 Calendar Drawer */}
      {showCalendarDrawer && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCalendarDrawer(false)}
          />
          {/* Drawer */}
          <div className="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-gray-900 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="h-5 w-5 text-amber-400" />
                <span className="font-semibold text-white text-base">Upcoming Events</span>
              </div>
              <button
                onClick={() => setShowCalendarDrawer(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Community Events button */}
            <button
              onClick={() => { setShowCommunityEventsView(true); setShowCalendarDrawer(false); fetchCommunityEvents(true); }}
              className="mx-4 mt-4 mb-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-900/60 to-blue-900/60 border border-purple-700/40 hover:border-purple-500/60 text-white transition-all active:scale-95"
            >
              <span className="text-xl">📅</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Community Events</p>
                <p className="text-xs text-gray-400">Requests &amp; scheduled sessions</p>
              </div>
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              {calendarLoading ? (
                <div className="space-y-3 mt-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="animate-pulse flex gap-3 p-3 rounded-xl bg-gray-800">
                      <div className="w-10 h-10 rounded-lg bg-gray-700 flex-shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 bg-gray-700 rounded w-3/4" />
                        <div className="h-3 bg-gray-700 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : calendarEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CalendarDaysIcon className="h-12 w-12 text-gray-600 mb-3" />
                  <p className="text-sm font-medium text-gray-400">No upcoming events</p>
                  <p className="text-xs text-gray-600 mt-1">Events from rooms you've joined will appear here</p>
                </div>
              ) : (() => {
                const now = new Date();
                const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
                const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);

                const todayEvs = calendarEvents.filter(ev => new Date(ev.start_time) <= todayEnd);
                const weekEvs = calendarEvents.filter(ev => {
                  const d = new Date(ev.start_time);
                  return d > todayEnd && d <= weekEnd;
                });
                const laterEvs = calendarEvents.filter(ev => new Date(ev.start_time) > weekEnd);

                const getEmoji = (ev) => {
                  const t = ev.watch_type || '';
                  if (t === '3d_cinema' || t === 'cinema') return '🎬';
                  if (t === 'classroom') return '🎓';
                  if (t === 'church') return '⛪';
                  if (t === 'podcast') return '🎙️';
                  return '📺';
                };

                const EventCard = ({ ev }) => (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-800 border border-gray-700/50 hover:border-amber-500/40 transition-colors">
                    <span className="text-xl flex-shrink-0 mt-0.5">{getEmoji(ev)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{ev.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' · '}
                        {new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </p>
                      {ev.Room?.name && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{ev.Room.name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {ev.is_paid && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700/50">Paid</span>
                        )}
                        {ev.recurrence_type && ev.recurrence_type !== 'none' && (
                          <span className="text-[10px] text-amber-500">↻ {ev.recurrence_type}</span>
                        )}
                      </div>
                    </div>
                    {ev.Room?.ID && (
                      <button
                        onClick={() => { setShowCalendarDrawer(false); navigate(`/rooms/${ev.Room.ID}`); }}
                        className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors"
                      >
                        Join
                      </button>
                    )}
                  </div>
                );

                const Section = ({ label, evs }) => evs.length === 0 ? null : (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
                    <div className="space-y-2">
                      {evs.map(ev => <EventCard key={ev.ID || ev.id} ev={ev} />)}
                    </div>
                  </div>
                );

                return (
                  <>
                    <Section label="Today" evs={todayEvs} />
                    <Section label="This Week" evs={weekEvs} />
                    <Section label="Later" evs={laterEvs} />
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* 🎪 Community Events fullscreen overlay (opened from calendar drawer) */}
      {showCommunityEventsView && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowCommunityEventsView(false)}
          />
          <div className="fixed inset-0 z-50 flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setShowCommunityEventsView(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <CommunityEventsCard
              scheduledEvents={communityEventsData.scheduledEvents}
              requests={communityEventsData.requests}
              leaderboard={leaderboardData}
              vsBattleLeaderboard={vsBattleLeaderboardData}
              currentUser={currentUser}
              apiBaseUrl={API_BASE_URL}
              onRSVP={(event) => { setShowCommunityEventsView(false); setSelectedEventForCalendar(event); setIsCalendarModalOpen(true); }}
              onNewRequest={(req) => setCommunityEventsData(prev => ({ ...prev, requests: [req, ...prev.requests] }))}
            />
          </div>
        </>
      )}

      {/* Status Viewer */}
      {viewingStatus && (
        <StatusViewer
          feedUser={viewingStatus}
          isOwnProfile={viewingStatus.user_id === currentUser?.id}
          onClose={() => setViewingStatus(null)}
          onDeleted={(deletedId) => {
            setStatusFeed(prev => prev.map(u =>
              u.user_id === viewingStatus.user_id
                ? { ...u, statuses: u.statuses.filter(s => s.id !== deletedId) }
                : u
            ).filter(u => u.statuses.length > 0));
          }}
        />
      )}

      {/* Status Privacy Sheet */}
      {showStatusPrivacy && (
        <StatusPrivacySheet
          friendsList={friendsList}
          onClose={() => setShowStatusPrivacy(false)}
        />
      )}

      {/* Status Creator */}
      {showStatusCreator && (
        <StatusCreator
          onClose={() => setShowStatusCreator(false)}
          liveRooms={liveRooms}
          onCreated={(newStatus) => {
            setStatusFeed(prev => {
              const ownIdx = prev.findIndex(u => u.user_id === currentUser?.id);
              const item = { ...newStatus, has_viewed: true };
              if (ownIdx >= 0) {
                const updated = [...prev];
                updated[ownIdx] = { ...updated[ownIdx], statuses: [...updated[ownIdx].statuses, item] };
                return updated;
              }
              return [{ user_id: currentUser?.id, username: currentUser?.username, avatar_url: currentUser?.avatar_url, has_unseen: false, statuses: [item] }, ...prev];
            });
          }}
        />
      )}

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          targetName={reportTarget.targetName}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* Session Share Modal */}
      {shareModalSession && (
        <SessionShareModal
          session={shareModalSession}
          friends={friendsList}
          currentUser={currentUser}
          isFavourited={!!savedRooms[shareModalSession.room_id]}
          onToggleFavourite={handleToggleFavourite}
          onClose={() => setShareModalSession(null)}
        />
      )}

      {/* ── Bottom Taskbar ── */}
      {/* ✅ Circle of Friends Sphere */}
      <CircleOfFriendsSphere
        isOpen={showCircleSphere}
        onClose={() => setShowCircleSphere(false)}
        currentUser={currentUser}
        friendsList={friendsList}
        circleMembers={friendsList.filter(f => circleOfFriendsIds.includes(f.id))}
        onAddMember={handleCircleAddMember}
        onRemoveMember={handleCircleRemoveMember}
        onChatWith={handleCircleChat}
        onCallUser={(friend) => { initiateCall(friend); }}
        onStartWatchOut={handleCircleWatchOut}
        onGroupChat={handleCircleGroupChat}
      />

      {chatView !== 'messages' && !isPostViewModalOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200/60 dark:border-gray-800/60">
          <div className="flex items-center justify-around px-2 h-16">
            {/* Calendar */}
            <button
              onClick={() => { setShowCalendarDrawer(true); setUpcomingEventsCount(0); }}
              className="p-2 relative text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all active:scale-90"
            >
              <div className="relative">
                <CalendarDaysIcon className="h-7 w-7" />
                {upcomingEventsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
                    {upcomingEventsCount > 9 ? '9+' : upcomingEventsCount}
                  </span>
                )}
              </div>
            </button>

            {/* Calls (chats tab) / Notifications (all other tabs) */}
            {activeTab === 'chats' ? (
              <button
                onClick={() => setIsCallHistoryModalOpen(true)}
                className="p-2 relative text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all active:scale-90"
              >
                <PhoneIcon className="h-7 w-7" />
              </button>
            ) : (
              <button
                onClick={() => { setShowNotifPanel(prev => !prev); if (unreadNotifCount > 0) markAllNotifsRead(); }}
                className="p-2 relative text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all active:scale-90"
              >
                <div className="relative">
                  <BellIcon className="h-7 w-7" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
                      {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                    </span>
                  )}
                </div>
              </button>
            )}

            {/* Center FAB */}
            <div className="relative -mt-5">
              {activeTab === 'chats' ? (
                <button
                  onClick={() => setShowCircleSphere(true)}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-700 to-indigo-800 shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-90 relative"
                  title="Circle of Friends"
                >
                  <img src="/icons/cof.webp" alt="Circle of Friends" className="w-10 h-10 object-contain" />
                  {circleOfFriendsIds.length > 0 && (
                    <span className="absolute top-0 right-0 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center text-[8px] font-bold bg-purple-400 text-white rounded-full">
                      {circleOfFriendsIds.length}
                    </span>
                  )}
                </button>
              ) : (activeTab === 'watching' && watchingSubTab === 'sessions') || (activeTab === 'rooms' && currentUser?.main_room_id) ? (
                <button
                  onClick={handleCenterFAB}
                  className="w-14 h-14 flex items-center justify-center transition-all active:scale-95"
                >
                  <img src="/icons/lwoIcon.webp" alt="Watch" className="w-14 h-14 object-contain" />
                </button>
              ) : (
                <button
                  onClick={handleCenterFAB}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-90"
                >
                  <Plus className="w-7 h-7 text-white" strokeWidth={3} />
                </button>
              )}
            </div>

            {/* Search */}
            <button
              onClick={handleSearchToggle}
              className={`p-2 transition-all active:scale-90 ${
                isSearchActive
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400'
              }`}
            >
              <Search className="w-7 h-7" />
            </button>

            {/* Home / New Group */}
            {activeTab === 'chats' ? (
              <button
                onClick={() => setShowCreateGroupModal(true)}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition-all active:scale-90"
                title="New Group"
              >
                <ChatBubbleLeftRightIcon className="w-7 h-7" />
              </button>
            ) : (
              <button
                onClick={handleHomeButton}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all active:scale-90"
              >
                {activeTab === 'watching' && isRefreshingWatchingNow ? (
                  <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <Home className="w-7 h-7" />
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LobbyPage;