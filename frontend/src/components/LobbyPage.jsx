// WeWatch/frontend/src/components/LobbyPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRooms, deleteRoom, getActiveSessions, verifySessionExists, getSentFriendRequests } from '../services/api';
import { TrashIcon, Bars3Icon, EllipsisVerticalIcon, ShareIcon, Cog6ToothIcon, ChartBarIcon, FilmIcon, PaperClipIcon, FaceSmileIcon, ChartBarSquareIcon, MicrophoneIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import jwtDecodeUtil from '../utils/jwt';
import apiClient from '../services/api';
import WatchTypeModal from './WatchTypeModal';
import ClassTypeModal from './modals/ClassTypeModal';
import AccessModal from './AccessModal';
import InstantWatchInfoModal from './InstantWatchInfoModal';
import toast, { Toaster } from 'react-hot-toast';
import LobbyLeftSidebar from './LobbyLeftSidebar';
import UserProfileModal from './UserProfileModal';
import SettingsModal from './SettingsModal';
import CreateNewModal from './CreateNewModal';
import DeleteRoomModal from './DeleteRoomModal';
import EventsPreviewModal from './EventsPreviewModal';
import SessionPreview from './SessionPreview';
import { useAuth } from '../contexts/AuthContext';
import LobbyMessageBubble from './lobby/LobbyMessageBubble';
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

const LobbyPage = () => {
  // ✅ Tab State
  const [activeTab, setActiveTab] = useState('rooms'); // 'chats', 'rooms', or 'watching' - default to 'rooms'
  
  const [searchTerm, setSearchTerm] = useState('');
  const [rooms, setRooms] = useState([]);
  const [sessions, setSessions] = useState([]); // ✅ Active watch sessions
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true); // ✅ Separate loading for sessions
  const [error, setError] = useState(null);
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]); // ✅ Filtered sessions
  const navigate = useNavigate();
  const [currentDisplay, setCurrentDisplay] = useState('current'); // 'current' or 'next'
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [isInstantWatchInfoModalOpen, setIsInstantWatchInfoModalOpen] = useState(false);
  const [isWatchTypeModalOpen, setIsWatchTypeModalOpen] = useState(false);
  const [isClassTypeModalOpen, setIsClassTypeModalOpen] = useState(false);
  const [selectedWatchType, setSelectedWatchType] = useState(null);
  const [selectedClassType, setSelectedClassType] = useState(null);
  const [selectedIsPublic, setSelectedIsPublic] = useState(true); // Store access choice
  const [selectedIsPrivate, setSelectedIsPrivate] = useState(false); // Store session privacy choice
  
  // ✅ Lobby Chat State
  const [friendsList, setFriendsList] = useState([]); // Users to chat with
  const [selectedChatUser, setSelectedChatUser] = useState(null); // Currently open chat
  const [chatMessages, setChatMessages] = useState({}); // { userId: [messages] }
  const [newChatMessage, setNewChatMessage] = useState('');
  const [chatsLoading, setChatsLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({}); // { userId: count }
  
  // ✅ Chat Enhancement Modals State
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [isPollCreatorOpen, setIsPollCreatorOpen] = useState(false);
  
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
  
  // ✅ Friend Request State
  const [pendingRequests, setPendingRequests] = useState([]); // Friend requests received
  const [sentRequests, setSentRequests] = useState([]); // Friend requests sent
  const [activeRequestsTab, setActiveRequestsTab] = useState('friends'); // 'friends' or 'requests'
  const [friendMenuOpen, setFriendMenuOpen] = useState(null); // Track which friend menu is open
  
  // ✅ Expanded View State (null, 'friends', or 'chat')
  const [expandedView, setExpandedView] = useState(null);
  
  // ✅ Left Sidebar & Modals State
  const [isLobbyLeftSidebarOpen, setIsLobbyLeftSidebarOpen] = useState(false);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCreateNewModalOpen, setIsCreateNewModalOpen] = useState(false);
  const [openMenuRoomId, setOpenMenuRoomId] = useState(null);
  const [roomToDelete, setRoomToDelete] = useState(null);
  
  // ✅ Events Preview Modal State
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [selectedRoomForEvents, setSelectedRoomForEvents] = useState(null);

  // ✅ Ticket Purchase Modal State
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [selectedSessionForTicket, setSelectedSessionForTicket] = useState(null);
  
  // ✅ Calendar Modal State (for trailers)
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [selectedEventForCalendar, setSelectedEventForCalendar] = useState(null);
  
  // ✅ Hover state for session cards
  const [hoveredSession, setHoveredSession] = useState(null);

  // WebSocket state for lobby real-time updates
  const wsRef = React.useRef(null);
  const [wsConnected, setWsConnected] = React.useState(false);
  
  // Session preview state
  const [sessionPreviews, setSessionPreviews] = useState({}); // { sessionId: { posterUrl, previewUrl, isGenerating } }
  const previewIntervalsRef = React.useRef({}); // Track intervals per session
  
  // ✅ Infinite Scroll State for "Watching Now"
  const [sessionsPage, setSessionsPage] = useState({ 
    data: [], 
    offset: 0, 
    hasMore: true,
    loading: false 
  });
  const [trailersPage, setTrailersPage] = useState({ 
    data: [], 
    offset: 0, 
    hasMore: true,
    loading: false 
  });
  const [isRefreshingWatchingNow, setIsRefreshingWatchingNow] = useState(false);
  
  // ✅ Infinite scroll refs
  const watchingNowScrollRef = React.useRef(null);
  const loadMoreTriggerRef = React.useRef(null);
  
  // ✅ Get current user from Auth Context
  const { currentUser, wsToken, refreshUser } = useAuth();
  
  // Use currentUser.id for authenticated user ID
  const authenticatedUserID = currentUser?.id || null;
  
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
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuRoomId]);

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

  // ✅ Handle access selection (public/private)
  const handleAccessSelected = (isPublic, isPrivate) => {
    setSelectedIsPublic(isPublic);
    setSelectedIsPrivate(isPrivate);
    setIsAccessModalOpen(false);
    setIsWatchTypeModalOpen(true);
  };

  // ✅ Handle watch type selection for instant watch
  const handleWatchTypeSelected = (watchType) => {
    console.log('✅ Watch type selected:', watchType);
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
    console.log('✅ Class type selected:', classType);
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
        is_private: selectedIsPrivate
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
        navigate(`/position-calculator/${route}?room_id=${room_id}&session_id=${session_id}&instant=true`, {
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

  // Filter rooms and sessions effect
  useEffect(() => {
    if (searchTerm === '') {
      setFilteredRooms(rooms);
      setFilteredSessions(sessions);
    } else {
      const termLower = searchTerm.toLowerCase().trim();
      const filtered = rooms.filter(room =>
        (room.name && room.name.toLowerCase().includes(termLower)) ||
        (room.description && room.description.toLowerCase().includes(termLower))
      );
      setFilteredRooms(filtered);
      
      // ✅ Filter sessions by room name or host username
      const filteredSess = sessions.filter(session =>
        (session.room_name && session.room_name.toLowerCase().includes(termLower)) ||
        (session.host_username && session.host_username.toLowerCase().includes(termLower))
      );
      setFilteredSessions(filteredSess);
    }
  }, [rooms, sessions, searchTerm]);

  // Fetch rooms function (moved outside useEffect so it can be reused)
  const fetchRoomsData = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getRooms();
      
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
      
      setRooms(filteredForRooms);
    } catch (err) {
      console.error("❌ [LobbyPage] Error fetching rooms:", err);
      setError('Failed to load rooms. Please try again later.');
      setRooms([]);
      setFilteredRooms([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Fetch active watch sessions
  const fetchSessionsData = async () => {
    setSessionsLoading(true);
    try {
      const data = await getActiveSessions();
      
      // Filter logic:
      // 1. Remove orphaned temporary sessions (no active members)
      // 2. Show all public sessions
      // 3. Show private sessions only if current user is a member
      const rawSessions = data.sessions || [];
      
      const filtered = rawSessions.filter(s => {
        // If temporary (instant watch) and zero members, skip it
        if (s.is_temporary && (s.member_count === 0 || s.member_count === undefined)) {
          return false;
        }
        
        // Show all public sessions
        if (s.is_public) return true;
        
        // For private sessions, check if current user is a member
        if (!s.is_public && authenticatedUserID) {
          // Check if user is in the members array or is the host
          const isMember = s.member_ids?.includes(authenticatedUserID) || s.host_id === authenticatedUserID;
          return isMember;
        }
        
        // Hide private sessions if user not authenticated
        return false;
      });
      
      console.log(`📊 [LobbyPage] Fetched ${filtered.length} active sessions`, filtered);
      setSessions(filtered);
    } catch (err) {
      console.error('❌ [LobbyPage] Error fetching active sessions:', err);
      // Don't set error state here, sessions are optional
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  // ✅ Fetch friends list for chat
  const fetchFriendsList = async () => {
    setChatsLoading(true);
    try {
      // Fetch accepted friends from friendship system
      const response = await apiClient.get('/api/friendships/list');
      // Normalize IDs to lowercase
      const normalizedFriends = (response.data.friends || []).map(friend => ({
        ...friend,
        id: friend.id || friend.ID
      }));
      setFriendsList(normalizedFriends);
    } catch (err) {
      console.error('Failed to fetch friends list:', err);
    } finally {
      setChatsLoading(false);
    }
  };
  
  // ✅ Fetch pending friend requests (received)
  const fetchPendingRequests = async () => {
    try {
      const response = await apiClient.get('/api/friendships/requests/pending');
      setPendingRequests(response.data.requests || []);
    } catch (err) {
      console.error('Failed to fetch pending requests:', err);
    }
  };
  
  // ✅ STEP 1: Pre-fetch first 10 sessions + trailers on lobby mount (background)
  const prefetchWatchingNowContent = async () => {
    console.log('🔄 [Lobby] Pre-fetching first 10 sessions + trailers...');
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
      
      console.log(`✅ [Lobby] Pre-fetched ${sessionsData.sessions?.length || 0} sessions, ${trailersData.events?.length || 0} trailers`);
    } catch (err) {
      console.error('❌ [Lobby] Pre-fetch failed:', err);
    }
  };
  
  // ✅ STEP 3: Load next batch of sessions (infinite scroll)
  const loadMoreSessions = async () => {
    if (sessionsPage.loading || !sessionsPage.hasMore) return;
    
    setSessionsPage(prev => ({ ...prev, loading: true }));
    
    try {
      const { getActiveSessions: getActiveSessionsPaginated } = await import('../services/api');
      const data = await getActiveSessionsPaginated(10, sessionsPage.offset);
      
      setSessionsPage(prev => ({
        data: [...prev.data, ...(data.sessions || [])],
        offset: prev.offset + 10,
        hasMore: data.has_more || false,
        loading: false
      }));
      
      console.log(`📥 [Lobby] Loaded next 10 sessions (total: ${sessionsPage.data.length + (data.sessions?.length || 0)})`);
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
      
      console.log(`📥 [Lobby] Loaded next 10 trailers (total: ${trailersPage.data.length + (data.events?.length || 0)})`);
    } catch (err) {
      console.error('❌ [Lobby] Load more trailers failed:', err);
      setTrailersPage(prev => ({ ...prev, loading: false }));
    }
  };
  
  // ✅ Refresh "Watching Now" content - resets list and fetches fresh data
  const handleRefreshWatchingNow = async () => {
    console.log('🔄 [LobbyPage] Refreshing Watching Now content...');
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
      
      console.log(`✅ [LobbyPage] Refreshed: ${sessionsData.sessions?.length || 0} sessions, ${trailersData.events?.length || 0} trailers`);
      toast.success('Watching Now refreshed!');
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
      console.error('Failed to fetch sent requests:', err);
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
    
    try {
      const response = await apiClient.get(`/api/lobby-chats/messages/${actualUserId}`);
      setChatMessages(prev => ({
        ...prev,
        [actualUserId]: response.data.messages || []
      }));
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
  
  // ✅ Send lobby chat message
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !selectedChatUser) return;
    
    try {
      const response = await apiClient.post('/api/lobby-chats/send', {
        recipient_id: selectedChatUser.id,
        message: newChatMessage
      });
      
      // Add message to local state
      setChatMessages(prev => ({
        ...prev,
        [selectedChatUser.id]: [...(prev[selectedChatUser.id] || []), response.data]
      }));
      
      setNewChatMessage('');
      scrollToBottomChat();
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
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
    fetchChatMessages(userId);
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
      to_user_id: user.id,
    }));

    // Set 30-second timeout
    callTimeoutRef.current = setTimeout(() => {
      console.log('📞 [Call] Timeout - no answer');
      setOutgoingCall(prev => ({ ...prev, status: 'no_answer' }));
      
      // Send cancel message to backend
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'call_cancel',
          to_user_id: user.id,
        }));
      }

      setTimeout(() => {
        setOutgoingCall(null);
      }, 2000);
    }, 30000);
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
            to_user_id: otherId,
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
            to_user_id: outgoingCall.user.id,
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
      to_user_id: incomingCall.user.id,
      call_id: incomingCall.callId,
    }));

    // Backend will respond with call_accepted including LiveKit token
  };

  const declineCall = () => {
    if (!incomingCall || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    console.log('📞 [Call] Declining call from:', incomingCall.user.username);

    wsRef.current.send(JSON.stringify({
      type: 'call_decline',
      to_user_id: incomingCall.user.id,
      call_id: incomingCall.callId,
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
        to_user_id: activeCall.user.id,
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
        to_user_id: outgoingCall.user.id,
      }));
    }

    setOutgoingCall(null);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchRoomsData();
    fetchSessionsData();
    if (currentUser) {
      fetchFriendsList();
      fetchPendingRequests();
      fetchSentRequests();
      
      // ✅ STEP 2: Pre-fetch "Watching Now" content in background
      prefetchWatchingNowContent();
    }
  }, [currentUser]);
  
  // ✅ STEP 4: Infinite scroll - Intersection Observer for load trigger
  useEffect(() => {
    if (!loadMoreTriggerRef.current || activeTab !== 'watching') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // User scrolled to trigger point - load next batch
          console.log('🔄 [Lobby] Infinite scroll triggered');
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
      // Auth still loading, WebSocket will connect when token is ready
      setWsConnected(false);
      return;
    }
    
    console.log('🔌 [LobbyPage WS] Connecting with auth token...');

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    let reconnectTimer = null;

    const connectWebSocket = () => {
      try {
        // ✅ FIX: Use API backend URL (Railway/localhost) instead of window.location (Vercel)
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
        const apiUrl = new URL(apiBaseUrl);
        const protocol = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
        const host = apiUrl.hostname;
        const port = apiUrl.port ? `:${apiUrl.port}` : '';
        
        // Build WebSocket URL using backend domain (Railway in production, localhost in dev)
        const wsUrl = `${protocol}://${host}${port}/api/lobby/ws?token=${encodeURIComponent(wsToken)}`;
        
        console.log(`🔗 [LobbyPage WS] Connecting to: ${wsUrl.split('?')[0]}`);
          
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log('✅ [LobbyPage WS] Connected');
          setWsConnected(true);
          reconnectAttempts = 0;
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
              case 'session_ended':
                fetchSessionsData();
                break;
                
              case 'friend_request_received':
                // Refresh pending requests when new request received
                fetchPendingRequests();
                toast.success(`${message.from_username} sent you a friend request!`);
                break;
                
              case 'friend_request_accepted':
                // Refresh friends list when request accepted
                fetchFriendsList();
                toast.success(`${message.from_username} accepted your friend request!`);
                break;
                
              case 'call_incoming':
                // Incoming call from another user
                console.log('📞 [Call] Incoming call from:', message.from_user);
                handleIncomingCall(message);
                break;
                
              case 'call_accepted':
                // Call was accepted, join LiveKit room
                console.log('📞 [Call] Call accepted:', message);
                handleCallAccepted(message);
                break;
                
              case 'call_declined':
                // Call was declined
                console.log('📞 [Call] Call declined');
                if (outgoingCall) {
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
                if (outgoingCall) {
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
                // Backend broadcasts when preview is ready (from frame upload)
                console.log(`🖼️ [LobbyPage] Preview ready - Full message:`, message);
                console.log(`🖼️ [LobbyPage] session_id: ${message.session_id}`);
                console.log(`🖼️ [LobbyPage] preview_url: ${message.preview_url}`);
                
                if (message.session_id) {
                  // ✅ If preview_url is empty, it means preview was cleared (media type switched)
                  if (!message.preview_url) {
                    console.log(`🧹 [LobbyPage] Preview cleared for session: ${message.session_id}`);
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: null,
                        previewUrl: null,
                        isGenerating: true, // Show loading state
                      }
                    }));
                  } else {
                    // Preview is ready
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: message.poster_url,
                        previewUrl: message.preview_url,
                        isGenerating: false,
                      }
                    }));
                  }
                }
                break;
                
              case 'media_state_changed':
                // ✅ EVENT-DRIVEN: Media started (LiveShare/WatchFrom/Upload)
                console.log(`📺 [LobbyPage] Media state changed: ${message.session_id}`);
                console.log(`📺 [LobbyPage] Media data:`, message.data);
                
                // ✅ Refresh sessions list to show the active session with updated media state
                setTimeout(() => {
                  console.log(`🔄 [LobbyPage] Fetching updated sessions after media state change`);
                  fetchSessionsData();
                }, 100); // Small delay to ensure backend DB update completes
                
                // ✅ Backend automatically generates preview and broadcasts session_preview_updated
                // No need to manually trigger - just wait for the WebSocket event
                break;
                
              case 'room_rating_updated':
                // ✅ Real-time rating update when someone rates a session
                console.log(`⭐ [LobbyPage] Rating updated for room ${message.room_id}: ${message.average_rating}`);
                
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
                          total_ratings: message.total_ratings 
                        }
                      : session
                  )
                );
                
                // Update paginated sessions data
                setSessionsPage(prev => ({
                  ...prev,
                  data: prev.data.map(session =>
                    session.room_id === message.room_id
                      ? { 
                          ...session, 
                          average_rating: message.average_rating, 
                          total_ratings: message.total_ratings 
                        }
                      : session
                  )
                }));
                break;
            }
          } catch (err) {
            console.error('❌ [LobbyPage WS] Failed to parse message:', err);
          }
        };
        
        ws.onclose = (event) => {
          if (event.code !== 1000) {
            console.log(`❌ [LobbyPage WS] Disconnected (code: ${event.code})`);
          }
          
          setWsConnected(false);
          
          // Attempt reconnection with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
            reconnectTimer = setTimeout(connectWebSocket, delay);
          }
        };
        
        ws.onerror = (error) => {
          console.error('❌ [LobbyPage WS] Connection error:', error.type);
        };
        
        wsRef.current = ws;
      } catch (error) {
        console.error('❌ [LobbyPage WS] Connection exception:', error.message);
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
          reconnectTimer = setTimeout(connectWebSocket, delay);
        }
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [wsToken]); // Re-run when wsToken becomes available

  // Fallback polling every 60 seconds (when WebSocket disconnects)  
  useEffect(() => {
    const interval = setInterval(() => {
      if (!wsConnected) {
        fetchRoomsData();
        fetchSessionsData();
      }
    }, 60000); // 60 seconds
  
    return () => clearInterval(interval);
  }, [wsConnected]);

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
    try {
      console.log('🎬 [Lobby] Direct join requested for session:', session.session_id);
      
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
            // Open ticket purchase modal directly (don't navigate away)
            console.log('🎟️ [Lobby] Ticket required - opening purchase modal');
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
    console.log('✅ [Lobby] Ticket purchased successfully for session:', sessionId);
    
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

  // ✅ Handle session card click with verification
  const handleSessionCardClick = async (session) => {
    // For regular rooms, just navigate to room page
    if (!session.is_temporary) {
      navigate(`/rooms/${session.room_id}`);
      return;
    }

    // For instant watch (temporary rooms), verify session still exists
    const { exists } = await verifySessionExists(session.session_id);
    
    if (!exists) {
      // Session has ended or been deleted
      toast.error('This watch session has ended', {
        duration: 3000,
        icon: '⏹️',
      });
      
      // Refresh sessions list to remove stale session
      await fetchSessionsData();
      return;
    }

    // Session exists, navigate to it
    if (session.watch_type === '3d_cinema') {
      navigate(`/cinema-3d-demo/${session.room_id}?session_id=${session.session_id}`, {
        state: {
          sessionId: session.session_id,
          currentUser,
          showLoadingOverlay: true
        }
      });
    } else {
      navigate(`/watch/${session.room_id}?session_id=${session.session_id}`, {
        state: {
          sessionId: session.session_id,
          currentUser,
          showLoadingOverlay: true
        }
      });
    }
  };

  // Handle create room
  const handleCreateRoom = () => {
    console.log("Create Room button clicked");
    navigate('/rooms/create');
  };

  // Handle share room link
  const handleShareRoom = async (roomId, roomName) => {
    const url = `${window.location.origin}/rooms/${roomId}`;
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
      console.log(`Room ${roomId} deleted successfully`);
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

  // ✅ Generate session preview (poster + GIF)
  const generateSessionPreview = async (sessionId) => {
    try {
      console.log(`🎬 [LobbyPage] Generating preview: ${sessionId}`);
      
      // Find the session to get its media state
      const session = sessions.find(s => s.session_id === sessionId);
      if (!session) {
        return;
      }
      
      // ✅ Detect source dynamically based on session state
      let source = 'upload'; // default
      let canGenerateGIF = true;
      
      if (session.watch_type === 'classroom' && session.class_type === 'lecture_hall') {
        // Lecture hall: Check media state from backend
        if (session.current_media_url && session.current_media_type === 'upload') {
          source = 'upload';
          canGenerateGIF = true;
        } else if (session.is_screen_sharing_active) {
          source = session.sharing_source || 'liveshare';
          canGenerateGIF = false; // Frame capture required
        } else {
          return; // No media
        }
      } else {
        source = 'upload';
        canGenerateGIF = true;
      }
      
      // ✅ For LiveShare/WatchFrom, request frame capture from host
      if (!canGenerateGIF) {
        console.log(`📸 [LobbyPage] Requesting frame capture: ${sessionId} (${source})`);
        
        // Set generating state
        setSessionPreviews(prev => ({
          ...prev,
          [sessionId]: { ...prev[sessionId], isGenerating: true }
        }));
        
        try {
          const response = await apiClient.post(`/api/sessions/${sessionId}/request-frame-capture`, {
            source: source
          });
          console.log(`✅ [LobbyPage] Frame capture requested`);
          
          // ✅ FALLBACK: If WebSocket disconnected, poll for preview after expected capture time
          if (!wsConnected) {
            console.log(`⏳ [LobbyPage] Fallback: Will check preview in 40s`);
            
            setTimeout(async () => {
              try {
                const data = await getActiveSessions();
                const updatedSession = data.sessions?.find(s => s.session_id === sessionId);
                
                if (updatedSession?.preview_url) {
                  console.log(`✅ [LobbyPage] Fallback: Preview found`);
                  setSessionPreviews(prev => ({
                    ...prev,
                    [sessionId]: {
                      posterUrl: updatedSession.poster_url,
                      previewUrl: updatedSession.preview_url,
                      isGenerating: false,
                    }
                  }));
                } else {
                  setSessionPreviews(prev => ({
                    ...prev,
                    [sessionId]: { ...prev[sessionId], isGenerating: false }
                  }));
                }
              } catch (err) {
                setSessionPreviews(prev => ({
                  ...prev,
                  [sessionId]: { ...prev[sessionId], isGenerating: false }
                }));
              }
            }, 40000);
          }
        } catch (err) {
          console.error(`❌ [LobbyPage] Frame capture failed:`, err.message);
          setSessionPreviews(prev => ({
            ...prev,
            [sessionId]: { ...prev[sessionId], isGenerating: false }
          }));
        }
        return;
      }
      
      // Generate GIF from uploaded media
      setSessionPreviews(prev => ({
        ...prev,
        [sessionId]: { ...prev[sessionId], isGenerating: true }
      }));

      const response = await apiClient.post(`/api/sessions/${sessionId}/generate-preview`, {
        source: source,
        current_time: '5',
      });

      setSessionPreviews(prev => ({
        ...prev,
        [sessionId]: {
          posterUrl: response.data.poster_url,
          previewUrl: response.data.preview_url,
          isGenerating: false,
        }
      }));

      console.log(`✅ [LobbyPage] Preview generated: ${sessionId}`);
    } catch (err) {
      // ✅ Check if this is an expected "no session" state vs real error
      const isExpectedNoSession = 
        err.response?.status === 404 || // Session not found
        err.response?.status === 400 && (
          err.response?.data?.error?.toLowerCase().includes('no media') ||
          err.response?.data?.error?.toLowerCase().includes('not playing') ||
          err.response?.data?.error?.toLowerCase().includes('no active session')
        );
      
      if (isExpectedNoSession) {
        // Silently skip - this is expected when no session is active or no media playing
        console.log(`ℹ️ [LobbyPage] Preview skipped for ${sessionId}: No active session or media`);
      } else {
        // Real error - log it (but don't show toast to avoid spamming users)
        console.error(`❌ [LobbyPage] Preview generation failed: ${sessionId}:`, err.message);
      }
      
      setSessionPreviews(prev => ({
        ...prev,
        [sessionId]: { ...prev[sessionId], isGenerating: false }
      }));
    }
  };

  // ✅ Setup preview generation for a session
  // Event-driven triggers happen instantly via media_state_changed WebSocket
  // This function only sets up the 5-minute refresh interval
  const setupPreviewGeneration = (sessionId) => {
    // Clear existing interval if any
    if (previewIntervalsRef.current[sessionId]) {
      clearInterval(previewIntervalsRef.current[sessionId].interval);
      clearTimeout(previewIntervalsRef.current[sessionId].timeout);
    }

    // Start 5-minute refresh interval (event-driven handles initial generation)
    const interval = setInterval(() => {
      generateSessionPreview(sessionId);
    }, 5 * 60 * 1000); // 5 minutes

    previewIntervalsRef.current[sessionId] = { interval };
  };

  // ✅ Setup preview generation for all active sessions
  useEffect(() => {
    // Setup preview generation for each session
    sessions.forEach(session => {
      const hasInterval = !!previewIntervalsRef.current[session.session_id];
      
      if (!hasInterval) {
        setupPreviewGeneration(session.session_id);
        
        // ✅ INITIAL CHECK: Only generate if no preview exists yet
        const hasActiveMedia = session.current_media_type || session.is_screen_sharing_active;
        const needsPreview = !sessionPreviews[session.session_id]?.previewUrl && !sessionPreviews[session.session_id]?.isGenerating;
        
        if (hasActiveMedia && needsPreview) {
          generateSessionPreview(session.session_id);
        }
      }
    });

    // Cleanup ONLY sessions that no longer exist
    return () => {
      const activeSessionIds = new Set(sessions.map(s => s.session_id));
      Object.keys(previewIntervalsRef.current).forEach(sessionId => {
        if (!activeSessionIds.has(sessionId)) {
          const { interval, timeout } = previewIntervalsRef.current[sessionId];
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
          delete previewIntervalsRef.current[sessionId];
        }
      });
    };
  }, [sessions]);

  return (
    <div className="relative min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-200">
      {/* ✅ Hamburger Menu Button - Fixed Top Left */}
      <button
        onClick={() => setIsLobbyLeftSidebarOpen(true)}
        className="fixed top-4 left-4 z-30 bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-lg shadow-lg transition-colors duration-200"
        aria-label="Open menu"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

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
      />

      {/* ✅ User Profile Modal */}
      <UserProfileModal
        user={currentUser}
        isOpen={isUserProfileModalOpen}
        onClose={() => setIsUserProfileModalOpen(false)}
        isOwnProfile={true}
        onSaveProfile={handleSaveProfile}
      />

      {/* ✅ Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
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

        {/* ✅ Create New Modal */}
        <CreateNewModal
          isOpen={isCreateNewModalOpen}
          onClose={() => setIsCreateNewModalOpen(false)}
          onInstantWatch={handleInstantWatch}
          onCreateRoom={handleCreateRoom}
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
        <div className="flex justify-center -mb-4">
          <img 
            src="/icons/LetsWatchOut Logo.svg" 
            alt="LetsWatchOut" 
            className="h-48 sm:h-60 w-auto"
          />
        </div>
      <p className="text-center mb-6 text-gray-700 dark:text-gray-300">Welcome! Find or create a room to start watching together.</p>

      {/* Search Bar Section with Create New Button - Only show on Rooms tab */}
      {activeTab === 'rooms' && (
        <div className="mb-4 sm:mb-8 flex justify-center">
          <div className="flex items-center gap-0 w-full max-w-3xl">
            {/* Create New Button - Seamlessly integrated on left */}
            <button
              type="button"
              onClick={() => setIsCreateNewModalOpen(true)}
              className="flex-shrink-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 border-r-0 rounded-l-lg px-2 py-1.5 sm:px-3 sm:py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Create New Room or Start Instant Watch"
            >
              <img 
                src="/icons/newRoom.svg" 
                alt="Create New" 
                className="h-6 w-6 sm:h-7 sm:w-7"
              />
            </button>

            {/* Search Form - Middle & Right */}
            <form onSubmit={handleSearchSubmit} className="flex flex-1">
              <input
                type="text"
                placeholder="Search room name or description..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="px-2 py-1.5 sm:px-4 sm:py-2 text-sm border border-gray-300 dark:border-gray-600 border-r-0 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold p-1.5 sm:p-2 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                title="Search"
              >
                <img 
                  src="/icons/searchIcon.svg" 
                  alt="Search" 
                  className="h-5 w-5 sm:h-6 sm:w-6"
                />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ✅ Tab Navigation */}
      <div className="mb-4 sm:mb-6">
        <div className="flex border-b border-gray-300 dark:border-gray-700">
          {/* Tab 1: Chats */}
          <button
            onClick={() => setActiveTab('chats')}
            className={`px-3 py-2 sm:px-6 sm:py-3 text-sm sm:text-lg font-semibold transition-colors relative ${
              activeTab === 'chats'
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Chats
            {Object.values(unreadCounts).reduce((sum, count) => sum + count, 0) > 0 && (
              <span className="ml-1 sm:ml-2 px-1.5 py-0.5 text-[10px] sm:text-xs bg-green-600 text-white rounded-full">
                {Object.values(unreadCounts).reduce((sum, count) => sum + count, 0)}
              </span>
            )}
            {activeTab === 'chats' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 dark:bg-green-400"></div>
            )}
          </button>
          
          {/* Tab 2: Rooms */}
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-3 py-2 sm:px-6 sm:py-3 text-sm sm:text-lg font-semibold transition-colors relative ${
              activeTab === 'rooms'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Rooms
            {activeTab === 'rooms' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></div>
            )}
          </button>
          
          {/* Tab 3: Watching Now */}
          <button
            onClick={() => setActiveTab('watching')}
            className={`px-3 py-2 sm:px-6 sm:py-3 text-sm sm:text-lg font-semibold transition-colors relative ${
              activeTab === 'watching'
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <span className="hidden sm:inline">Watching Now</span>
            <span className="sm:hidden">Watching</span>
            {sessions.length > 0 && (
              <span className="ml-1 sm:ml-2 px-1.5 py-0.5 text-[10px] sm:text-xs bg-purple-600 text-white rounded-full">
                {sessions.length}
              </span>
            )}
            {activeTab === 'watching' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400"></div>
            )}
          </button>
        </div>
      </div>

      {/* ✅ ROOMS TAB CONTENT */}
      {activeTab === 'rooms' && (
        <div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
                {filteredRooms.map((room) => {
                  return (
                  <div 
                    key={room.id} 
                    className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300 relative cursor-pointer border border-gray-200 dark:border-gray-700"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                   >
                    {/* Room Card Content - Horizontal Layout */}
                    <div className="flex items-center p-2 sm:p-4 gap-2 sm:gap-4">
                      {/* Left: Room Image - Circular like WhatsApp/Telegram */}
                      <div className="flex-shrink-0 relative">
                        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-2 ring-gray-300 dark:ring-gray-600">
                          {room.image_url ? (
                            <img 
                              src={room.image_url} 
                              alt={room.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FilmIcon className="w-6 h-6 sm:w-10 sm:h-10 text-white opacity-80" />
                          )}
                        </div>
                        
                        {/* Active Session Indicator - Pulsing Green Badge */}
                        {room.is_active_session && (
                          <div 
                            className="absolute bottom-0 right-0 bg-green-500 rounded-full p-1 sm:p-1.5 animate-pulse shadow-lg ring-2 ring-white dark:ring-gray-800"
                            title="Live Watch Session"
                          >
                            <svg className="h-2 w-2 sm:h-3 sm:w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    
                      {/* Right: Room Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-0.5 sm:mb-1">
                          <h2 className="text-base sm:text-xl font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate">
                            {room.name}
                          </h2>
                          {/* ✅ Room Rating Badge - Desktop: inline, Mobile: below name */}
                          {room.average_rating > 0 && (
                            <span className="flex items-center gap-1 text-xs sm:text-sm font-medium text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 w-fit mt-1 sm:mt-0" title={`${room.total_ratings} rating${room.total_ratings !== 1 ? 's' : ''}`}>
                              <svg className="w-3 h-3 sm:w-4 sm:h-4 fill-yellow-500" viewBox="0 0 24 24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                              {room.average_rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate mb-1">
                          Host: {room.host_username || `User ${room.host_id}`}
                        </p>
                        {/* ✅ Member Count - Below host name */}
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                          </svg>
                          <span>{room.member_count || 0}</span>
                        </div>
                      </div>
                    
                      {/* Schedule Icon - Moved to bottom-right to avoid ellipsis overlap */}
                      {room.has_upcoming_events && (
                        <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRoomForEvents({ id: room.id, name: room.name });
                              setIsEventsModalOpen(true);
                            }}
                            className="relative hover:opacity-80 transition-opacity"
                            title="View Scheduled Events"
                          >
                            <img 
                              src="/icons/scheduleWatchIcon.svg" 
                              alt="Scheduled Events" 
                              className="h-8 w-8 sm:h-10 sm:w-10"
                            />
                            {/* Badge with event count */}
                            <div 
                              className="absolute top-0 right-0 min-w-[16px] sm:min-w-[20px] h-4 sm:h-5 flex items-center justify-center rounded-full text-white text-[10px] sm:text-xs font-bold px-1 sm:px-1.5 bg-purple-500 shadow-lg"
                              title={`${room.upcoming_events_count || 0} scheduled event${room.upcoming_events_count !== 1 ? 's' : ''}`}
                            >
                              {room.upcoming_events_count || 0}
                            </div>
                          </button>
                        </div>
                      )}
                    
                    
                      {/* Ellipsis Menu - Top Right */}
                      {authenticatedUserID && (authenticatedUserID === room.host_id || currentUser?.role === 'super_admin') && (
                        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 room-menu">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuRoomId(openMenuRoomId === room.id ? null : room.id);
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            title="Room Options"
                          >
                            <EllipsisVerticalIcon className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600 dark:text-gray-400" />
                          </button>

                          {/* Dropdown Menu */}
                          {openMenuRoomId === room.id && (
                            <div className="absolute top-10 right-0 bg-white dark:bg-gray-800 shadow-lg rounded-lg w-48 py-2 z-50 border border-gray-200 dark:border-gray-700">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDeleteModal(room);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
                              >
                                <TrashIcon className="h-5 w-5 text-red-500" />
                                <span>Delete Room</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShareRoom(room.id, room.name);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
                              >
                                <ShareIcon className="h-5 w-5 text-blue-500" />
                                <span>Share Link</span>
                              </button>

                              <button
                                disabled
                                className="w-full text-left px-4 py-2 flex items-center gap-3 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                                title="Coming Soon"
                              >
                                <Cog6ToothIcon className="h-5 w-5" />
                                <span>Edit Settings</span>
                              </button>

                              <button
                                disabled
                                className="w-full text-left px-4 py-2 flex items-center gap-3 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                                title="Coming Soon"
                              >
                                <ChartBarIcon className="h-5 w-5" />
                                <span>Analytics</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
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

      {/* ✅ WATCHING NOW TAB CONTENT - TikTok-Style Vertical Scroll with Infinite Loading */}
      {activeTab === 'watching' && (
        <div 
          ref={watchingNowScrollRef}
          className="overflow-y-auto h-full custom-sleek-scrollbar"
          style={{ maxHeight: 'calc(100vh - 200px)' }}
        >
          {/* ✅ Refresh Button */}
          <div className="flex justify-center mb-4">
            <button
              onClick={handleRefreshWatchingNow}
              disabled={isRefreshingWatchingNow}
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh watching now content"
            >
              <svg 
                className={`w-6 h-6 text-gray-700 dark:text-gray-300 ${isRefreshingWatchingNow ? 'animate-spin' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                />
              </svg>
            </button>
          </div>
          
          <h2 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-white text-center">
            Watching Now {sessionsPage.data.length > 0 && `(${sessionsPage.data.length + trailersPage.data.length} items)`}
          </h2>

          {/* ✅ Trailers Section (auto-play loops) */}
          {trailersPage.data.length > 0 && (
            <div className="mb-8">
              <div className="space-y-6">{trailersPage.data.map((trailer) => (
                  <div 
                    key={trailer.ID}
                    className="relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-300"
                    style={{ minHeight: '400px' }}
                  >
                    {/* Trailer Video */}
                    <video 
                      src={`${import.meta.env.VITE_API_BASE_URL}/${trailer.trailer_url}`}
                      autoPlay 
                      loop 
                      muted 
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    
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
          {sessionsPage.data.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 text-blue-600 dark:text-blue-400 text-center">
                🔴 Live Now
              </h3>
              <div className="space-y-6">
                {sessionsPage.data.map((session) => {
                  const preview = sessionPreviews[session.session_id] || {};
                  
                  // Determine watch type display
                  const watchTypeConfig = {
                    'classroom': { emoji: '🎓', name: 'Classroom', color: 'green' },
                    '3d_cinema': { emoji: '🎭', name: '3D Cinema', color: 'blue' },
                    'video': { emoji: '🎬', name: 'Video Watch', color: 'purple' }
                  };
                  const watchType = watchTypeConfig[session.watch_type] || watchTypeConfig['video'];
                  
                  return (
                  <div 
                    key={session.session_id}
                    className="relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-[1.02] cursor-pointer group"
                    style={{ minHeight: '500px' }}
                    onMouseEnter={() => setHoveredSession(session.session_id)}
                    onMouseLeave={() => setHoveredSession(null)}
                  >
                    {/* Preview Background */}
                    <div className="absolute inset-0">
                      <SessionPreview
                        session={session}
                        previewUrl={preview.previewUrl}
                        posterUrl={preview.posterUrl}
                        isGenerating={preview.isGenerating}
                      />
                    </div>
                    
                    {/* Dark Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none"></div>
                    
                    {/* ✅ Join Now Overlay (shows on hover) */}
                    <div 
                      className={`absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300 ${
                        hoveredSession === session.session_id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-4 z-20">
                        {/* Primary Join Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinSessionDirect(session);
                          }}
                          className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-xl hover:from-blue-500 hover:to-purple-500 transform hover:scale-105 transition-all shadow-2xl flex items-center gap-3"
                        >
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                          </svg>
                          {session.ticketing_enabled && session.ticket_price_tokens > 0 ? 'Purchase & Join' : 'Join Now'}
                        </button>
                        
                        {/* Show price if paid session */}
                        {session.ticketing_enabled && session.ticket_price_tokens > 0 && (
                          <div className="flex items-center gap-2 bg-yellow-500/20 backdrop-blur-sm px-4 py-2 rounded-full border border-yellow-400">
                            <img src="/icons/coins.svg" alt="Tokens" className="w-5 h-5" />
                            <span className="text-yellow-300 font-bold text-lg">
                              {session.early_bird_active && session.early_bird_enabled 
                                ? session.early_bird_price_tokens 
                                : session.ticket_price_tokens} tokens
                            </span>
                            {session.early_bird_active && session.early_bird_enabled && (
                              <span className="text-green-300 text-xs font-semibold bg-green-600/30 px-2 py-0.5 rounded-full">
                                🎉 EARLY BIRD
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Secondary: View Room Details */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/rooms/${session.room_id}`);
                          }}
                          className="px-6 py-2 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-all border border-white/30 text-sm"
                        >
                          View Room Details
                        </button>
                      </div>
                    </div>
                    
                    {/* ✅ Rating Badge Overlay (Top Right) */}
                    {session.average_rating > 0 && (
                      <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm px-3 py-2 rounded-lg flex items-center gap-2 shadow-xl z-10">
                        <svg className="w-5 h-5 fill-yellow-400" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        <span className="text-white font-bold text-lg">{session.average_rating.toFixed(1)}</span>
                        <span className="text-gray-300 text-sm">({session.total_ratings})</span>
                      </div>
                    )}
                    
                    {/* Details Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white pointer-events-none">
                      {/* Badges Row */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold bg-${watchType.color}-500/90 backdrop-blur-sm rounded-full`}>
                          <span>{watchType.emoji}</span>
                          <span>{watchType.name}</span>
                        </span>
                        
                        {session.ticketing_enabled && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold bg-yellow-500/90 backdrop-blur-sm rounded-full">
                            <span>🪙</span>
                            <span>Paid</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-3xl font-bold mb-3 drop-shadow-lg line-clamp-2">
                        {session.room_name}
                      </h3>

                      <div className="flex items-center gap-4 text-base mb-2">
                        <span className="font-medium">👤 {session.host_username}</span>
                        <span>👥 {session.member_count} viewers</span>
                      </div>
                    </div>
                    
                    <div className="absolute inset-0 border-4 border-transparent hover:border-blue-500/50 transition-colors duration-300 rounded-2xl pointer-events-none"></div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

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
        </div>
      )}
      
      {/* ✅ CHATS TAB CONTENT */}
      {activeTab === 'chats' && (
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-white text-center">
            Lobby Chats
          </h2>
          
          {chatsLoading ? (
            <div className="flex justify-center items-center h-96">
              <p className="text-lg text-gray-700 dark:text-gray-300">Loading chats...</p>
            </div>
          ) : (
            <div className="flex gap-2 sm:gap-4 h-[calc(100vh-220px)] sm:h-[calc(100vh-250px)]">
              {/* Left: Friends List - Always visible unless chat is expanded */}
              <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ${
                expandedView === 'chat' ? 'hidden' : 
                expandedView === 'friends' ? 'fixed inset-0 w-screen h-screen z-50 rounded-none' : 
                'w-[35%] min-w-[200px] max-w-[320px]'
              }`}>
                <div className="bg-gradient-to-r from-green-600 to-green-700 p-2 sm:p-4 flex items-center justify-between">
                  <h3 className="text-white font-semibold text-base sm:text-lg">Friends</h3>
                  <button
                    onClick={() => setExpandedView(expandedView === 'friends' ? null : 'friends')}
                    className="text-white hover:bg-white/20 rounded p-1 transition-colors"
                    title={expandedView === 'friends' ? 'Exit fullscreen' : 'Expand fullscreen'}
                  >
                    {expandedView === 'friends' ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    )}
                  </button>
                </div>
                
                {/* Sub-tabs for Friends vs Requests */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <button
                    onClick={() => setActiveRequestsTab('friends')}
                    className={`flex-1 px-3 py-2 text-xs sm:text-sm font-medium transition-colors relative ${
                      activeRequestsTab === 'friends'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    Friends
                    {activeRequestsTab === 'friends' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 dark:bg-green-400"></div>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveRequestsTab('requests')}
                    className={`flex-1 px-3 py-2 text-xs sm:text-sm font-medium transition-colors relative ${
                      activeRequestsTab === 'requests'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    Requests
                    {pendingRequests.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded-full">
                        {pendingRequests.length}
                      </span>
                    )}
                    {activeRequestsTab === 'requests' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 dark:bg-green-400"></div>
                    )}
                  </button>
                </div>
                
                {/* Friends Tab Content */}
                {activeRequestsTab === 'friends' && (
                  <div 
                    className="overflow-y-auto flex-1 custom-sleek-scrollbar"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#10b981 #1f2937',
                    }}
                  >
                    {friendsList.length === 0 ? (
                      <div className="text-center py-6 sm:py-10 text-gray-500 dark:text-gray-400">
                        <p className="text-xs sm:text-sm">No friends yet</p>
                        <p className="text-[10px] sm:text-xs mt-2 px-4">Accept friend requests to start chatting!</p>
                      </div>
                    ) : (
                      friendsList.map(friend => {
                      const unreadCount = unreadCounts[friend.id] || 0;
                      const isSelected = selectedChatUser?.id === friend.id;
                      
                      return (
                        <div key={friend.id} className="relative group friend-menu-container">
                          <button
                            onClick={() => handleOpenChat(friend)}
                            className={`w-full p-2 sm:p-4 flex items-center gap-2 sm:gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700 ${
                              isSelected ? 'bg-green-50 dark:bg-gray-700' : ''
                            }`}
                          >
                            {/* Avatar */}
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0 overflow-hidden">
                              {friend.avatar_url ? (
                                <img src={friend.avatar_url} alt={friend.username} className="w-full h-full object-cover" />
                              ) : (
                                friend.username?.[0]?.toUpperCase() || 'U'
                              )}
                            </div>
                            
                            {/* Info */}
                            <div className="flex-1 text-left min-w-0">
                              <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                                {friend.username}
                              </p>
                            </div>
                            
                            {/* Unread Badge */}
                            {unreadCount > 0 && (
                              <div className="bg-green-600 text-white text-[10px] sm:text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center flex-shrink-0">
                                {unreadCount > 9 ? '9+' : unreadCount}
                              </div>
                            )}
                          </button>
                          
                          {/* Ellipsis Menu Button */}
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
                          
                          {/* Dropdown Menu */}
                          {friendMenuOpen === friend.id && (
                            <div className="absolute right-2 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[150px]">
                              <button
                                onClick={() => {
                                  setFriendMenuOpen(null);
                                  handleRemoveFriend(friend.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                🚫 Unfriend
                              </button>
                              <button
                                onClick={() => {
                                  setFriendMenuOpen(null);
                                  handleBlockUser(friend.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                ⛔ Block User
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
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
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0 overflow-hidden">
                                {requester.avatar_url ? (
                                  <img src={requester.avatar_url} alt={requester.username} className="w-full h-full object-cover" />
                                ) : (
                                  requester.username?.[0]?.toUpperCase() || 'U'
                                )}
                              </div>
                              
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
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0 overflow-hidden">
                                {recipient.avatar_url ? (
                                  <img src={recipient.avatar_url} alt={recipient.username} className="w-full h-full object-cover" />
                                ) : (
                                  recipient.username?.[0]?.toUpperCase() || 'U'
                                )}
                              </div>
                              
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
              
              {/* Right: Chat Window - Always wider */}
              <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ${
                expandedView === 'friends' ? 'hidden' : 
                expandedView === 'chat' ? 'fixed inset-0 w-screen h-screen z-50 rounded-none' : 
                'flex-1'
              }`}>
                {selectedChatUser ? (
                  <>
                    {/* Chat Header */}
                    <div className="bg-gradient-to-r from-green-600 to-green-700 p-2 sm:p-4 flex items-center gap-2 sm:gap-3">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm sm:text-base overflow-hidden">
                        {selectedChatUser.avatar_url ? (
                          <img src={selectedChatUser.avatar_url} alt={selectedChatUser.username} className="w-full h-full object-cover" />
                        ) : (
                          selectedChatUser.username?.[0]?.toUpperCase() || 'U'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold text-sm sm:text-base truncate">{selectedChatUser.username}</h3>
                      </div>
                      <button
                        onClick={() => initiateCall(selectedChatUser)}
                        className="text-white hover:bg-white/20 rounded p-1 transition-colors flex-shrink-0"
                        title="Call"
                      >
                        <span className="text-xl">📞</span>
                      </button>
                      <button
                        onClick={() => setExpandedView(expandedView === 'chat' ? null : 'chat')}
                        className="text-white hover:bg-white/20 rounded p-1 transition-colors flex-shrink-0"
                        title={expandedView === 'chat' ? 'Exit fullscreen' : 'Expand fullscreen'}
                      >
                        {expandedView === 'chat' ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                        )}
                      </button>
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
                        chatMessages[selectedChatUser.id]?.map((msg, index) => (
                          <LobbyMessageBubble
                            key={msg.id || index}
                            message={msg}
                            isOwn={msg.sender_id === currentUser?.id}
                            currentUser={currentUser}
                            onEdit={handleEditMessage}
                            onDelete={handleDeleteMessage}
                            onVotePoll={handleVotePoll}
                          />
                        ))
                      )}
                      <div ref={chatMessagesEndRef} />
                    </div>
                    
                    {/* Message Input - Enhanced with Voice, Attachments, Stickers, Polls */}
                    {isRecording ? (
                      /* Voice Recording Mode */
                      <div className="p-4 bg-red-50 dark:bg-red-900/30 border-t-2 border-red-500">
                        <div className="flex items-center gap-3">
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
                      /* Normal Message Input */
                      <form onSubmit={handleSendChatMessage} className="p-2 sm:p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                        {/* Action Buttons Row */}
                        <div className="flex gap-2 mb-2">
                          <button
                            type="button"
                            onClick={() => setIsAttachModalOpen(true)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Attach file"
                          >
                            <PaperClipIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsStickerPickerOpen(true)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Send sticker"
                          >
                            <FaceSmileIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsPollCreatorOpen(true)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Create poll"
                          >
                            <ChartBarSquareIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            type="button"
                            onClick={startRecording}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Record voice note"
                          >
                            <MicrophoneIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          </button>
                        </div>
                        
                        {/* Text Input Row */}
                        <div className="flex gap-1.5 sm:gap-2">
                          <input
                            type="text"
                            value={newChatMessage}
                            onChange={(e) => setNewChatMessage(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 px-2 py-1.5 sm:px-4 sm:py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                          />
                          <button
                            type="submit"
                            disabled={!newChatMessage.trim()}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold p-2 sm:py-2 sm:px-6 text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            <PaperAirplaneIcon className="w-5 h-5 sm:hidden" />
                            <span className="hidden sm:inline">Send</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    <div className="text-center px-4">
                      <FilmIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 opacity-30" />
                      <p className="text-base sm:text-lg">Select a friend to start chatting</p>
                      <p className="text-xs sm:text-sm mt-1 sm:mt-2">Continue conversations outside watch sessions</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      </div>

      {/* ✅ Chat Enhancement Modals */}
      {selectedChatUser && (
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
        onEndCall={handleEndCall}
        localParticipant={callRoom?.localParticipant}
        remoteParticipant={callRoom?.participants ? Array.from(callRoom.participants.values())[0] : null}
      />
    </div>
  );
};

export default LobbyPage;