// WeWatch/frontend/src/components/LobbyPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getRooms, deleteRoom, getActiveSessions, verifySessionExists, getSentFriendRequests, getAssetUrl } from '../services/api';
import { TrashIcon, Bars3Icon, EllipsisVerticalIcon, ShareIcon, Cog6ToothIcon, ChartBarIcon, FilmIcon, PaperClipIcon, FaceSmileIcon, ChartBarSquareIcon, MicrophoneIcon, PaperAirplaneIcon, PhoneIcon, ArrowsPointingOutIcon, UsersIcon, UserIcon, VideoCameraIcon, AcademicCapIcon, HeartIcon, ChatBubbleLeftIcon, ArrowUpIcon } from '@heroicons/react/24/solid';
import { HeartIcon as HeartOutlineIcon, ChatBubbleLeftIcon as ChatOutlineIcon, FaceSmileIcon as FaceSmileOutlineIcon, MicrophoneIcon as MicrophoneOutlineIcon, PaperClipIcon as PaperClipOutlineIcon, ChartBarSquareIcon as ChartBarSquareOutlineIcon } from '@heroicons/react/24/outline';
import { Plus } from 'lucide-react';
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
import PostUploadModal from './PostUploadModal';
import PostViewModal from './PostViewModal';
import DiscoverFeed from './DiscoverFeed';
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
import { Button } from './ui/button';
import { Input } from './ui/input';
import DateOfBirthPromptModal from './DateOfBirthPromptModal';
import { checkDateOfBirth, updateDateOfBirth } from '../services/api';
import SessionChatPreviewModal from './SessionChatPreviewModal';
import { formatCount } from '../utils/formatCount';
import TikTokHeartAnimation from './TikTokHeartAnimation';
import FeedAdCard from './ads/FeedAdCard';
import { calculateAge } from '../utils/ageUtils';

// CSS for custom pulsing animations
const pulseAnimationStyles = `
  @keyframes pulseRed {
    0%, 100% {
      color: #ef4444;
      opacity: 1;
    }
    50% {
      color: #dc2626;
      opacity: 0.8;
    }
  }
  
  @keyframes scaleSquare {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }
  
  .pulse-red-cross {
    animation: pulseRed 1.5s ease-in-out infinite;
  }
  
  .scale-square {
    animation: scaleSquare 1.5s ease-in-out infinite;
  }
`;

const LobbyPage = () => {
  // ✅ Tab State
  const [activeTab, setActiveTab] = useState('rooms'); // 'chats', 'rooms', or 'watching' - default to 'rooms'
  
  // ✅ Data Saver State
  const [dataSaverEnabled, setDataSaverEnabled] = React.useState(
    localStorage.getItem('dataSaverMode') === 'true'
  );
  
  // Listen for localStorage changes (when toggled in sidebar)
  React.useEffect(() => {
    const checkDataSaver = () => {
      setDataSaverEnabled(localStorage.getItem('dataSaverMode') === 'true');
    };
    window.addEventListener('storage', checkDataSaver);
    // Also check periodically since localStorage events don't fire in same tab
    const interval = setInterval(checkDataSaver, 500);
    return () => {
      window.removeEventListener('storage', checkDataSaver);
      clearInterval(interval);
    };
  }, []);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [rooms, setRooms] = useState([]);
  const [sessions, setSessions] = useState([]); // ✅ Active watch sessions
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true); // ✅ Separate loading for sessions
  const [error, setError] = useState(null);
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]); // ✅ Filtered sessions
  
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
  
  // ✅ Lobby Chat State
  const [friendsList, setFriendsList] = useState([]); // Users to chat with
  const [selectedChatUser, setSelectedChatUser] = useState(null); // Currently open chat
  const [chatMessages, setChatMessages] = useState({}); // { userId: [messages] }
  const [newChatMessage, setNewChatMessage] = useState('');
  const [chatsLoading, setChatsLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({}); // { userId: count }
  const [friendsSearchTerm, setFriendsSearchTerm] = useState(''); // Search friends
  const [chatView, setChatView] = useState('friends'); // 'friends' or 'messages'
  const [lastMessagePreviews, setLastMessagePreviews] = useState({}); // { userId: lastMessage }
  const [onlineStatus, setOnlineStatus] = useState({}); // { userId: boolean }
  
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
  
  // ✅ Fullscreen Watching Now State
  const [isWatchingNowFullscreen, setIsWatchingNowFullscreen] = useState(false);
  const [fullscreenSessionIndex, setFullscreenSessionIndex] = useState(0);
  const fullscreenScrollRef = React.useRef(null);
  
  // ✅ Left Sidebar & Modals State
  const [isLobbyLeftSidebarOpen, setIsLobbyLeftSidebarOpen] = useState(false);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCreateNewModalOpen, setIsCreateNewModalOpen] = useState(false);
  const [isPostUploadModalOpen, setIsPostUploadModalOpen] = useState(false);
  const [openMenuRoomId, setOpenMenuRoomId] = useState(null);
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
  
  // Session preview state
  const [sessionPreviews, setSessionPreviews] = useState({}); // { sessionId: { posterUrl, previewUrl, isGenerating } }
  const previewIntervalsRef = React.useRef({}); // Track intervals per session
  
  // ✅ Session Likes State
  const [sessionLikes, setSessionLikes] = useState({}); // { sessionId: { count, isLiked } }
  
  // ✅ Session Chat Counts State
  const [sessionChatCounts, setSessionChatCounts] = useState({}); // { sessionId: messageCount }
  
  // ✅ Chat Preview Modal State (OLD - kept for backward compatibility)
  const [isChatPreviewOpen, setIsChatPreviewOpen] = useState(false);
  const [selectedSessionForChat, setSelectedSessionForChat] = useState(null);
  
  // 💬 Interactive Session Chat State (70-30 Split Mode)
  const [activeChatSession, setActiveChatSession] = useState(null); // Session object with chat open
  const [sessionChatMessages, setSessionChatMessages] = useState([]); // Real-time session chat messages
  const [chatWsRef, setChatWsRef] = useState(null); // WebSocket connection for chat
  const [isChatConnecting, setIsChatConnecting] = useState(false);
  
  // ❤️ Like Animation State
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const lastLikeTimeRef = React.useRef({});
  
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
  
  // 🔍 Discover Search State
  const [discoverSearch, setDiscoverSearch] = useState('');
  
  // 🎯 Feed Ads State
  const [feedAds, setFeedAds] = useState([]);
  const [fetchingFeedAds, setFetchingFeedAds] = useState(false);
  
  // ✅ Infinite scroll refs
  const watchingNowScrollRef = React.useRef(null);
  const loadMoreTriggerRef = React.useRef(null);
  const discoverFeedRef = React.useRef(null);
  
  // ✅ Get current user from Auth Context
  const { currentUser, wsToken, refreshUser } = useAuth();
  
  // Use currentUser.id for authenticated user ID
  const authenticatedUserID = currentUser?.id || null;
  
  // ❤️ Handle session like/unlike (single click to toggle)
  const handleSessionLike = async (sessionId, e) => {
    e.stopPropagation();
    
    if (!currentUser) {
      toast.error('Please login to like sessions');
      return;
    }
    
    const currentLikeState = sessionLikes[sessionId] || { count: 0, isLiked: false };
    
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
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
      
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
    
    // Close previous chat if open
    if (activeChatSession && chatWsRef) {
      chatWsRef.close();
      setChatWsRef(null);
    }
    
    // Set active chat session (triggers 70-30 split rendering)
    setActiveChatSession(session);
    setSessionChatMessages([]);
    setIsChatConnecting(true);
    
    // Connect to WebSocket for this session
    connectToSessionChat(session);
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
        // Silently handle errors (session might be private or ended)
        console.log(`ℹ️ [LobbyChat] Failed to fetch chat for ${session.session_id}:`, err.response?.data?.error || err.message);
        setIsChatConnecting(false);
      }
    };

    // Initial fetch
    fetchMessages();
    
    // Poll every 2 seconds while chat is open
    const interval = setInterval(fetchMessages, 2000);
    
    // Store interval reference with close method for cleanup compatibility
    setChatWsRef({ 
      close: () => clearInterval(interval),
      interval: interval
    });
  };
  
  // 🚪 Close interactive chat
  const handleCloseChatPreview = () => {
    if (chatWsRef) {
      chatWsRef.close();
      setChatWsRef(null);
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
  
  // 🧹 Cleanup WebSocket on unmount or when leaving fullscreen
  useEffect(() => {
    return () => {
      if (chatWsRef) {
        chatWsRef.close();
        setChatWsRef(null);
      }
    };
  }, [chatWsRef]);
  
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
      
      console.log('📨 [LobbyPage] Opening chat with user from navigation:', userToChat);
      
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
      
      console.log('📺 [LobbyPage] Opening post from RoomTV:', postId);
      
      // Switch to watching tab and discover sub-tab
      setActiveTab('watching');
      setWatchingSubTab('discover');
      
      // Fetch and open the post
      apiClient.get(`/api/posts/${postId}`)
        .then(response => {
          setSelectedPost(response.data.post);
          setIsPostViewModalOpen(true);
          
          // If autoPlay is requested, trigger play (handled by PostViewModal)
          if (autoPlay) {
            console.log('▶️ [LobbyPage] Auto-playing post from RoomTV');
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
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuRoomId]);
  
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
          console.log('⚠️ [DOB Check] User has not provided date of birth, showing prompt');
          setIsDOBPromptOpen(true);
        } else {
          console.log('✅ [DOB Check] User has provided date of birth');
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
      console.log('✅ [DOB Update] Date of birth updated successfully');
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
    console.log('🎬 [handleAccessSelected] Received:', { isPublic, isPrivate, contentRating });
    setSelectedIsPublic(isPublic);
    setSelectedIsPrivate(isPrivate);
    setSelectedContentRating(contentRating || 'G'); // Store content rating
    console.log('🎬 [handleAccessSelected] State will be set to:', contentRating || 'G');
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
        is_private: selectedIsPrivate,
        content_rating: selectedContentRating || 'G' // Include content rating
      };
      
      console.log('🎬 [createInstantWatchSession] Sending request with content_rating:', requestBody.content_rating);
      console.log('🎬 [createInstantWatchSession] is_private flag:', selectedIsPrivate ? 'TRUE (Hidden from Lobby) ✅' : 'FALSE (Visible in Lobby) ❌');
      console.log('🎬 [createInstantWatchSession] Full request body:', requestBody);

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

  // ✅ Infinite scroll observer for rooms
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Load more when sentinel is visible and we have more rooms to load
        if (entries[0].isIntersecting && hasMoreRooms && !loadingMoreRooms && activeTab === 'rooms') {
          console.log('📜 [LobbyPage] Loading more rooms...');
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
  const fetchRoomsData = async (page = 0, append = false) => {
    if (!append) {
      setLoading(true);
    } else {
      setLoadingMoreRooms(true);
    }
    setError(null);

    try {
      const limit = 20;
      const offset = page * limit;
      const data = await getRooms(limit, offset);
      
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
        setRooms(prevRooms => [...prevRooms, ...filteredForRooms]);
      } else {
        setRooms(filteredForRooms);
      }
      
      // Update pagination state
      setHasMoreRooms(data.has_more || false);
      setRoomsPage(page);
      
    } catch (err) {
      console.error("❌ [LobbyPage] Error fetching rooms:", err);
      setError('Failed to load rooms. Please try again later.');
      if (!append) {
        setRooms([]);
        setFilteredRooms([]);
      }
    } finally {
      setLoading(false);
      setLoadingMoreRooms(false);
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
    console.log('👥 [Lobby] Fetching friends list...');
    setChatsLoading(true);
    try {
      // Fetch accepted friends from friendship system
      const response = await apiClient.get('/api/friendships/list');
      console.log('✅ [Lobby] Friends list response:', response.data);
      // Normalize IDs to lowercase
      const normalizedFriends = (response.data.friends || []).map(friend => ({
        ...friend,
        id: friend.id || friend.ID
      }));
      setFriendsList(normalizedFriends);
      console.log(`👥 [Lobby] Loaded ${normalizedFriends.length} friends`);
    } catch (err) {
      console.error('❌ [Lobby] Failed to fetch friends list:', err);
      console.error('❌ [Lobby] Error details:', err.response?.data || err.message);
    } finally {
      setChatsLoading(false);
    }
  };
  
  // ✅ Fetch pending friend requests (received)
  const fetchPendingRequests = async () => {
    console.log('📬 [Lobby] Fetching pending requests...');
    try {
      const response = await apiClient.get('/api/friendships/requests/pending');
      setPendingRequests(response.data.requests || []);
      console.log(`📬 [Lobby] Loaded ${response.data.requests?.length || 0} pending requests`);
    } catch (err) {
      console.error('❌ [Lobby] Failed to fetch pending requests:', err);
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
        // Store single ad, we'll inject it multiple times
        console.log('🎯 [Lobby] Feed ad fetched:', response.data.ad);
        setFeedAds([response.data.ad]);
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
    console.log('📤 [Lobby] Fetching sent requests...');
    try {
      const response = await getSentFriendRequests();
      setSentRequests(response.data.requests || []);
      console.log(`📤 [Lobby] Loaded ${response.data.requests?.length || 0} sent requests`);
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
    
    try {
      const response = await apiClient.get(`/api/lobby-chats/messages/${actualUserId}`);
      const messages = response.data.messages || [];
      
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
            text: lastMsg.message_type === 'text' ? lastMsg.message : `[${lastMsg.message_type}]`,
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
    setChatView('messages'); // ✅ Switch to messages view
    fetchChatMessages(userId);
  };
  
  // ✅ Handle back to friends list
  const handleBackToFriends = () => {
    setChatView('friends');
    setSelectedChatUser(null);
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
      setWsConnected(false);
      return;
    }

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
                fetchSessionsData();
                // ✅ Immediately trigger preview generation for new session
                if (message.session_id) {
                  setTimeout(() => generateSessionPreview(message.session_id), 500);
                }
                break;
                
              case 'session_ended':
                // ✅ OPTIMISTIC UPDATE: Remove session immediately without API call
                if (message.session_id) {
                  console.log(`🗑️ [Lobby] Session ended: ${message.session_id} - removing from state`);
                  
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
                console.log(`🖼️ [LobbyPage] 📥 Preview update received:`, {
                  session_id: message.session_id,
                  poster_url: message.poster_url,
                  preview_url: message.preview_url
                });
                
                if (message.session_id) {
                  // ✅ Handle different scenarios:
                  // 1. Poster only (MP4 not ready): show poster
                  // 2. Both poster + MP4: show video
                  // 3. Empty URLs: clearing preview (media switched)
                  
                  if (!message.poster_url && !message.preview_url) {
                    // Empty URLs = clearing preview
                    console.log(`🧹 [LobbyPage] Preview cleared for session: ${message.session_id}`);
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: null,
                        previewUrl: null,
                        isGenerating: true,
                        isClearing: false,
                      }
                    }));
                  } else if (message.poster_url && !message.preview_url) {
                    // Poster only (MP4 generating or upload video)
                    console.log(`📸 [LobbyPage] Poster ready for session ${message.session_id}:`, message.poster_url);
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: message.poster_url,
                        previewUrl: null,
                        isGenerating: false, // ✅ Show poster, not spinner
                        isClearing: false,
                      }
                    }));
                  } else {
                    // Full preview ready (poster + MP4)
                    console.log(`✅ [LobbyPage] Full preview ready for session ${message.session_id}`);
                    setSessionPreviews(prev => ({
                      ...prev,
                      [message.session_id]: {
                        posterUrl: message.poster_url,
                        previewUrl: message.preview_url,
                        isGenerating: false,
                        isClearing: false,
                      }
                    }));
                  }
                }
                break;
                
              case 'media_state_changed':
                // ✅ EVENT-DRIVEN: Media started (LiveShare/WatchFrom/Upload)
                console.log(`📺 [LobbyPage] Media state changed: ${message.session_id}`);
                console.log(`📺 [LobbyPage] Media data:`, message.data);
                
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
                    // Add new session if not present (fetch full data)
                    setTimeout(() => {
                      console.log(`🔄 [LobbyPage] Fetching updated sessions after media state change`);
                      fetchSessionsData();
                    }, 100);
                    return prev;
                  }
                });
                
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
                        }
                      : session
                  )
                );
                break;
                
              case 'session_liked':
                // ✅ Real-time like update
                console.log(`❤️ [LobbyPage] Session liked: ${message.session_id}, count: ${message.likes_count}`);
                setSessionLikes(prev => ({
                  ...prev,
                  [message.session_id]: {
                    ...prev[message.session_id],
                    count: message.likes_count
                  }
                }));
                break;
                
              case 'session_unliked':
                // ✅ Real-time unlike update
                console.log(`💔 [LobbyPage] Session unliked: ${message.session_id}, count: ${message.likes_count}`);
                setSessionLikes(prev => ({
                  ...prev,
                  [message.session_id]: {
                    ...prev[message.session_id],
                    count: message.likes_count
                  }
                }));
                break;
                
              case 'session_chat_sent':
                // ✅ Real-time chat count update (for users NOT currently viewing the chat)
                console.log(`💬 [LobbyPage] Chat sent in session: ${message.session_id}, count: ${message.chat_count}`);
                // Only update if chat is NOT open (open chat updates from polling)
                if (activeChatSession?.session_id !== message.session_id) {
                  setSessionChatCounts(prev => ({
                    ...prev,
                    [message.session_id]: message.chat_count
                  }));
                }
                break;
                
              case 'rating_updated':
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
    // ✅ Skip only if already generating (prevent concurrent API calls)
    if (sessionPreviews[sessionId]?.isGenerating) {
      console.log(`⏳ [LobbyPage] Already generating preview for ${sessionId}`);
      return;
    }

    try {
      console.log(`🎬 [LobbyPage] Generating preview: ${sessionId}`);
      
      // Find the session in BOTH states (sessions and sessionsPage)
      const session = sessions.find(s => s.session_id === sessionId) || 
                      sessionsPage.data.find(s => s.session_id === sessionId);
      if (!session) {
        console.log(`⏸️ [LobbyPage] Session ${sessionId} not found, skipping preview`);
        return;
      }
      
      // ✅ Check if preview generation is disabled (content moderation)
      if (session.preview_enabled === false) {
        console.log(`⏸️ [LobbyPage] Preview generation disabled for session ${sessionId}, skipping`);
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

  // ✅ Setup preview generation for all active sessions
  useEffect(() => {
    // Setup preview generation for each session from sessionsPage (the actual rendered data)
    sessionsPage.data.forEach(session => {
      const hasInterval = !!previewIntervalsRef.current[session.session_id];
      
      // Skip if preview generation is disabled for this session
      if (session.preview_enabled === false) {
        console.log(`⏸️ [LobbyPage] Skipping preview setup for ${session.session_id} (disabled)`);
        return;
      }
      
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
      const activeSessionIds = new Set(sessionsPage.data.map(s => s.session_id));
      Object.keys(previewIntervalsRef.current).forEach(sessionId => {
        if (!activeSessionIds.has(sessionId)) {
          const { interval, timeout } = previewIntervalsRef.current[sessionId];
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
          delete previewIntervalsRef.current[sessionId];
        }
      });
    };
  }, [sessionsPage.data, sessionPreviews]);
  
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
          onCreatePost={() => setIsPostUploadModalOpen(true)}
        />

        {/* ✅ Post Upload Modal */}
        <PostUploadModal
          isOpen={isPostUploadModalOpen}
          onClose={() => setIsPostUploadModalOpen(false)}
          onSuccess={() => {
            // Switch to discover tab and refresh feed
            setActiveTab('watching');
            setWatchingSubTab('discover');
            // Refresh discover feed after a short delay to ensure backend processed upload
            setTimeout(() => {
              if (discoverFeedRef.current?.refresh) {
                discoverFeedRef.current.refresh();
              }
            }, 500);
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
        <div className="flex justify-center -mb-4">
          <img 
            src="/icons/LetsWatchOut Logo.svg" 
            alt="LetsWatchOut" 
            className="h-[173px] sm:h-[151px] w-auto"
          />
        </div>
      <p className="text-center mb-6 text-gray-700 dark:text-gray-300">Welcome! Find or create a room to start watching together.</p>

      {/* Search Bar Section - Only show on Rooms tab */}
      {activeTab === 'rooms' && (
        <div className="mb-4 sm:mb-8 flex justify-center">
          <div className="flex items-center gap-0 w-full max-w-3xl">
            {/* Search Form - Full Width */}
            <form onSubmit={handleSearchSubmit} className="flex flex-1">
              <input
                type="text"
                placeholder="Search room name or description..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="px-2 py-1.5 sm:px-4 sm:py-2 text-sm border border-gray-300 dark:border-gray-600 border-r-0 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-l-lg"
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
            
            {/* Data Saver Indicator Badge */}
            {dataSaverEnabled && (
              <div className="ml-2 sm:ml-4 flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 bg-green-600 text-white text-[10px] sm:text-xs font-semibold rounded-full shadow-lg">
                <span>💾</span>
                <span className="hidden sm:inline">Data Saver Active</span>
                <span className="sm:hidden">Data Saver</span>
              </div>
            )}
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
            Watching Now
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
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
                  {filteredRooms.map((room) => {
                  const isOwnRoom = authenticatedUserID === room.host_id;
                  const isMember = room.is_member && !isOwnRoom; // Member but not owner
                  return (
                  <div 
                    key={room.id} 
                    className={`bg-white dark:bg-gray-800 shadow-md rounded-lg hover:shadow-lg transition-shadow duration-300 relative cursor-pointer ${
                      isOwnRoom 
                        ? 'ring-2 ring-purple-500 dark:ring-purple-400' 
                        : isMember
                        ? 'ring-2 ring-blue-500 dark:ring-blue-400'
                        : 'border border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={() => navigate(`/rooms/${room.id}`)}
                   >
                    {/* Room Card Content - Horizontal Layout */}
                    <div className="flex items-center p-2 sm:p-4 gap-2 sm:gap-4">
                      {/* Left: Room Image - Circular like WhatsApp/Telegram */}
                      <div className="flex-shrink-0 relative">
                        {/* TikTok-style Live Pulse for active sessions */}
                        {room.is_active_session && (
                          <>
                            {/* Subtle expanding ring (background) */}
                            <div className="absolute -inset-2 sm:-inset-2.5 rounded-full bg-red-500/30 animate-ping"></div>
                            
                            {/* Pulsing red ring overlay */}
                            <div className="absolute inset-0 w-14 h-14 sm:w-20 sm:h-20 rounded-full ring-[3px] ring-red-500 animate-pulse pointer-events-none" style={{ animationDuration: '2s' }}></div>
                          </>
                        )}
                        
                        <div className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${
                          room.is_active_session 
                            ? '' 
                            : 'ring-2 ring-gray-300 dark:ring-gray-600'
                        }`}>
                          {room.image_url ? (
                            <img 
                              src={getAssetUrl(room.image_url)} 
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
                          {/* ✅ "Your Room" Badge */}
                          {isOwnRoom && (
                            <span className="flex items-center gap-1 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full flex-shrink-0 w-fit" title="You own this room">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                              </svg>
                              Your Room
                            </span>
                          )}
                          {/* ✅ "Member" Badge */}
                          {isMember && (
                            <span className="flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full flex-shrink-0 w-fit" title="You are a member of this room">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                              </svg>
                              Member
                            </span>
                          )}
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
                        
                        {/* ✅ Room Description - Only if enabled and exists */}
                        {(room.show_description === true || room.ShowDescription === true) && room.description && room.description.trim() !== '' && (
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1.5 sm:mb-2 pr-10 sm:pr-12 leading-relaxed">
                            {room.description}
                          </p>
                        )}
                        
                        {/* ✅ Member Count - Below description/host */}
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
                            className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
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
              
              {/* ✅ Infinite Scroll Sentinel & Loading Indicator */}
              <div ref={roomsObserverTarget} className="w-full py-4">
                {loadingMoreRooms && (
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className="ml-3 text-gray-600 dark:text-gray-400">Loading more rooms...</span>
                  </div>
                )}
                {!hasMoreRooms && rooms.length > 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
                    No more rooms to load
                  </p>
                )}
              </div>
              </>
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
        
        {/* Floating Create New Button - Only visible on Rooms tab */}
        {activeTab === 'rooms' && (
          <div className="relative">
            <style>{pulseAnimationStyles}</style>
            <button
              onClick={() => {
                setIsCreateNewModalOpen(true);
                if (showCreateButtonPulse) {
                  localStorage.setItem('hasSeenCreateButton', 'true');
                  setShowCreateButtonPulse(false);
                }
              }}
              className={`fixed bottom-20 left-4 sm:bottom-24 sm:left-6 z-40 w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-110 flex items-center justify-center group ${
                showCreateButtonPulse ? 'animate-pulse ring-4 ring-blue-400 ring-opacity-50' : ''
              }`}
              title="Create New Room or Start Instant Watch"
            >
              <Plus className="w-7 h-7 sm:w-8 sm:h-8 text-white" strokeWidth={3} />
              
              {/* Notification Dot - First-time indicator */}
              {showCreateButtonPulse && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
              )}
            </button>
          </div>
        )}
        </div>
      )}

      {/* ✅ WATCHING NOW TAB CONTENT - TikTok-Style Vertical Scroll with Infinite Loading */}
      {activeTab === 'watching' && (
        <div 
          ref={watchingNowScrollRef}
          className="overflow-y-auto overflow-x-hidden h-full scrollbar-hide"
          style={{ maxHeight: 'calc(100vh - 200px)', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* ✅ Sub-tab Navigation: Watching Live | Discover */}
          <div className="border-b border-gray-300 dark:border-gray-700 mb-6">
            {/* Desktop: Tabs and search on same line */}
            <div className="hidden md:flex items-center justify-between gap-4 px-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setWatchingSubTab('sessions')}
                  className={`px-4 py-2 font-semibold transition-all ${
                    watchingSubTab === 'sessions'
                      ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Watching Live
                </button>
                <button
                  onClick={() => setWatchingSubTab('discover')}
                  className={`px-4 py-2 font-semibold transition-all ${
                    watchingSubTab === 'discover'
                      ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Discover
                </button>
              </div>
              
              {/* 🔍 Search input (desktop) */}
              <div className="relative flex-1 max-w-xs">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder={watchingSubTab === 'discover' ? 'Search posts...' : 'Search sessions...'}
                  value={discoverSearch}
                  onChange={(e) => setDiscoverSearch(e.target.value)}
                  className="w-full pl-10 pr-10 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white placeholder-gray-400"
                />
                {discoverSearch && (
                  <button
                    onClick={() => setDiscoverSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile: Tabs on top, search below */}
            <div className="md:hidden">
              <div className="flex gap-2 px-4">
                <button
                  onClick={() => setWatchingSubTab('sessions')}
                  className={`px-4 py-2 font-semibold transition-all ${
                    watchingSubTab === 'sessions'
                      ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Watching Live
                </button>
                <button
                  onClick={() => setWatchingSubTab('discover')}
                  className={`px-4 py-2 font-semibold transition-all ${
                    watchingSubTab === 'discover'
                      ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Discover
                </button>
              </div>
              
              {/* 🔍 Search input (mobile - below tabs) */}
              <div className="px-4 pt-3 pb-2">
                <div className="relative w-full">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder={watchingSubTab === 'discover' ? 'Search posts...' : 'Search sessions...'}
                    value={discoverSearch}
                    onChange={(e) => setDiscoverSearch(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white placeholder-gray-400"
                  />
                  {discoverSearch && (
                    <button
                      onClick={() => setDiscoverSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ✅ WATCHING NOW CONTENT - Keep both mounted for instant switching */}
          <div className={watchingSubTab === 'sessions' ? 'block' : 'hidden'}>
            <>
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
              <div className="space-y-6">{trailersPage.data.map((trailer, index) => (
                  <div 
                    key={trailer.ID}
                    onClick={() => handleOpenFullscreen(index)}
                    className="relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-300 cursor-pointer"
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
                        muted={false}
                      />
                    </div>
                    
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
                              <img src={session.room_avatar_url} alt={session.room_name} className="w-full h-full object-cover" />
                            ) : (
                              session.room_name?.[0]?.toUpperCase() || 'R'
                            )}
                          </div>
                        </div>
                        
                        {/* Room Name + Star Rating */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span 
                            className="font-semibold text-white text-sm truncate"
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
                              <span className="text-white font-bold text-xs" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
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
                          className="text-lg font-bold leading-tight line-clamp-2"
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
                          <span className="inline-flex items-center gap-1.5">
                            {session.watch_type === 'classroom' ? (
                              <AcademicCapIcon className="w-4 h-4 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                            ) : session.watch_type === '3d_cinema' ? (
                              <VideoCameraIcon className="w-4 h-4 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                            ) : (
                              <FilmIcon className="w-4 h-4 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                            )}
                            <span>{watchType.name}</span>
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
                      {/* Content Rating - Neon Outline Frame */}
                      {session.content_rating && (
                        <div 
                          className="w-[38px] h-14 flex items-center justify-center border-2"
                          style={{
                            borderColor: 
                              session.content_rating === 'G' ? 'rgb(74, 222, 128)' :
                              session.content_rating === 'PG' ? 'rgb(96, 165, 250)' :
                              session.content_rating === '13+' ? 'rgb(250, 204, 21)' :
                              session.content_rating === '18+' ? 'rgb(248, 113, 113)' :
                              session.content_rating === 'Mature' ? 'rgb(192, 132, 252)' :
                              'rgb(156, 163, 175)',
                            boxShadow: 
                              session.content_rating === 'G' ? 'inset 0 0 12px rgba(74, 222, 128, 0.3), 0 0 12px rgba(74, 222, 128, 0.6), 0 0 24px rgba(74, 222, 128, 0.4)' :
                              session.content_rating === 'PG' ? 'inset 0 0 12px rgba(96, 165, 250, 0.3), 0 0 12px rgba(96, 165, 250, 0.6), 0 0 24px rgba(96, 165, 250, 0.4)' :
                              session.content_rating === '13+' ? 'inset 0 0 12px rgba(250, 204, 21, 0.3), 0 0 12px rgba(250, 204, 21, 0.6), 0 0 24px rgba(250, 204, 21, 0.4)' :
                              session.content_rating === '18+' ? 'inset 0 0 12px rgba(248, 113, 113, 0.3), 0 0 12px rgba(248, 113, 113, 0.6), 0 0 24px rgba(248, 113, 113, 0.4)' :
                              session.content_rating === 'Mature' ? 'inset 0 0 12px rgba(192, 132, 252, 0.3), 0 0 12px rgba(192, 132, 252, 0.6), 0 0 24px rgba(192, 132, 252, 0.4)' :
                              'inset 0 0 12px rgba(156, 163, 175, 0.3), 0 0 12px rgba(156, 163, 175, 0.6), 0 0 24px rgba(156, 163, 175, 0.4)'
                          }}
                        >
                          <img 
                            src={
                              session.content_rating === 'G' ? '/icons/G Rating Icon.png' :
                              session.content_rating === 'PG' ? '/icons/PG Rating Icon.png' :
                              session.content_rating === '13+' ? '/icons/13_ Rating Icon.png' :
                              session.content_rating === '18+' ? '/icons/18_ Rating Icon.png' :
                              session.content_rating === 'Mature' ? '/icons/Mature Rating Icon.png' :
                              '/icons/G Rating Icon.png'
                            }
                            alt={`${session.content_rating} rating`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      
                      {/* Likes */}
                      <button
                        onClick={(e) => handleSessionLike(session.session_id, e)}
                        className="flex flex-col items-center gap-1 group transition-transform hover:scale-110"
                      >
                        <HeartIcon 
                          className={`w-9 h-9 ${
                            sessionLikes[session.session_id]?.isLiked ? 'text-red-500' : 'text-white'
                          }`} 
                          style={{ 
                            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))',
                            fill: sessionLikes[session.session_id]?.isLiked ? 'currentColor' : 'none',
                            stroke: sessionLikes[session.session_id]?.isLiked ? 'none' : 'currentColor',
                            strokeWidth: sessionLikes[session.session_id]?.isLiked ? 0 : 1.5
                          }} 
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
                        <ChatBubbleLeftIcon className="w-9 h-9 text-white" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                        <span className="text-white text-xs font-bold" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                          {formatCount(sessionChatCounts[session.session_id] || 0)}
                        </span>
                      </button>
                      
                      {/* Members */}
                      <div className="flex flex-col items-center gap-1">
                        <UsersIcon className="w-9 h-9 text-white" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                        <span className="text-white text-xs font-bold" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                          {formatCount(session.member_count || 0)}
                        </span>
                      </div>
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
                          console.log('🎯 [Lobby] Feed ad impression tracked');
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

          {/* ✅ DISCOVER FEED CONTENT - Keep mounted for instant switching */}
          <div className={watchingSubTab === 'discover' ? 'block' : 'hidden'}>
            <>
              <DiscoverFeed
                ref={discoverFeedRef}
                searchQuery={discoverSearch}
                onPostClick={(post) => {
                  console.log('🎬 [LobbyPage] Opening post modal:', {
                    postId: post.ID,
                    title: post.title,
                    currentModalState: isPostViewModalOpen,
                  });
                  setSelectedPost(post);
                  setIsPostViewModalOpen(true);
                }}
              />
              
              {/* Floating Post Button - Only visible on Discover tab */}
              <button
                onClick={() => setIsPostUploadModalOpen(true)}
                className="fixed bottom-20 left-4 sm:bottom-24 sm:left-6 z-40 w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-110 flex items-center justify-center group"
                title="Create Post"
              >
                <Plus className="w-7 h-7 sm:w-8 sm:h-8 text-white" strokeWidth={3} />
              </button>
            </>
          </div>
        </div>
      )}
      
      {/* ✅ Session Chat Preview Modal */}
      <SessionChatPreviewModal
        isOpen={isChatPreviewOpen}
        onClose={() => setIsChatPreviewOpen(false)}
        sessionId={selectedSessionForChat?.session_id}
        sessionTitle={selectedSessionForChat?.session_title || selectedSessionForChat?.currently_playing}
      />
      
      {/* ✅ CHATS TAB CONTENT */}
      {activeTab === 'chats' && (
        <div className={selectedChatUser ? "fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900" : "max-w-5xl mx-auto"}>
          {chatsLoading ? (
            <div className={selectedChatUser ? "flex justify-center items-center h-full" : "flex justify-center items-center h-96"}>
              <p className="text-lg text-gray-700 dark:text-gray-300">Loading chats...</p>
            </div>
          ) : (
            <div className={selectedChatUser ? "h-full flex flex-col" : "h-[calc(100vh-160px)] sm:h-[calc(100vh-200px)]"}>
              {/* ✅ STACKED SINGLE-VIEW: Friends List OR Messages (Mobile-First) */}
              {chatView === 'friends' ? (
                /* ========== FRIENDS LIST VIEW ========== */
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col h-full">
                  {/* ✅ Friends List Header */}
                  <div className="bg-gradient-to-r from-green-600 to-green-700 p-3 sm:p-4">
                    <h3 className="text-white font-bold text-lg sm:text-xl mb-3">Chats</h3>
                    
                    {/* ✅ Search Bar */}
                    <div className="relative">
                      <input
                        type="text"
                        value={friendsSearchTerm}
                        onChange={(e) => setFriendsSearchTerm(e.target.value)}
                        placeholder="Search friends..."
                        className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-full text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
                      />
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
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
                
                  {/* ✅ Friends Tab Content - Enhanced with message previews */}
                  {activeRequestsTab === 'friends' && (
                    <div 
                      className="overflow-y-auto flex-1 custom-sleek-scrollbar"
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#10b981 #1f2937',
                      }}
                    >
                      {friendsList.filter(f => 
                        !friendsSearchTerm || 
                        f.username.toLowerCase().includes(friendsSearchTerm.toLowerCase())
                      ).length === 0 ? (
                        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                          {friendsSearchTerm ? (
                            <>
                              <p className="text-sm">No friends found</p>
                              <p className="text-xs mt-2">Try a different search</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm">No friends yet</p>
                              <p className="text-xs mt-2 px-4">Accept friend requests to start chatting!</p>
                            </>
                          )}
                        </div>
                      ) : (
                        friendsList
                          .filter(f => 
                            !friendsSearchTerm || 
                            f.username.toLowerCase().includes(friendsSearchTerm.toLowerCase())
                          )
                          .map(friend => {
                          const unreadCount = unreadCounts[friend.id] || 0;
                          const lastMsg = lastMessagePreviews[friend.id];
                          const isOnline = onlineStatus[friend.id];
                          
                          return (
                            <div key={friend.id} className="relative group friend-menu-container">
                              <button
                                onClick={() => handleOpenChat(friend)}
                                className="w-full p-3 sm:p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700"
                              >
                                {/* Avatar with Online Status */}
                                <div className="relative flex-shrink-0">
                                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden ring-2 ring-white dark:ring-gray-800">
                                    {friend.avatar_url ? (
                                      <img src={friend.avatar_url} alt={friend.username} className="w-full h-full object-cover" />
                                    ) : (
                                      friend.username?.[0]?.toUpperCase() || 'U'
                                    )}
                                  </div>
                                  {/* Online Status Indicator */}
                                  {isOnline && (
                                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                                  )}
                                </div>
                                
                                {/* Info with Message Preview */}
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
                                    <p className={`text-sm truncate ${
                                      unreadCount > 0 
                                        ? 'font-medium text-gray-900 dark:text-white' 
                                        : 'text-gray-600 dark:text-gray-400'
                                    }`}>
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
                                
                                {/* Unread Badge */}
                                {unreadCount > 0 && (
                                  <div className="bg-green-600 text-white text-xs font-bold rounded-full min-w-[24px] h-6 flex items-center justify-center px-2 flex-shrink-0">
                                    {unreadCount > 99 ? '99+' : unreadCount}
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
              
              ) : (
                /* ========== MESSAGES VIEW ========== */
                <div 
                  className="bg-white dark:bg-gray-800 shadow-lg overflow-hidden flex flex-col h-full"
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
                          className="text-white hover:bg-white/20 rounded-full p-2 transition-colors flex-shrink-0"
                          title="Back to friends"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        
                        {/* Friend Avatar */}
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-base overflow-hidden ring-2 ring-white/30 flex-shrink-0">
                          {selectedChatUser.avatar_url ? (
                            <img src={selectedChatUser.avatar_url} alt={selectedChatUser.username} className="w-full h-full object-cover" />
                          ) : (
                            selectedChatUser.username?.[0]?.toUpperCase() || 'U'
                          )}
                        </div>
                        
                        {/* Friend Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-base sm:text-lg truncate">{selectedChatUser.username}</h3>
                          {onlineStatus[selectedChatUser.id] && (
                            <p className="text-white/80 text-xs">● Online</p>
                          )}
                        </div>
                        
                        {/* Call Button */}
                        <Button
                          onClick={() => initiateCall(selectedChatUser)}
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-white hover:bg-white/20 hover:text-white flex-shrink-0 rounded-full"
                          title="Call"
                        >
                          <PhoneIcon className="h-6 w-6" />
                        </Button>
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
                      <div className="absolute bottom-0 left-0 right-0">
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
                      <form onSubmit={handleSendChatMessage} className="absolute bottom-0 left-0 right-0">
                        <div className="mb-2 mx-3 relative bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-2">
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
                                <MicrophoneOutlineIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsStickerPickerOpen(true)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Send emoji/sticker"
                              >
                                <FaceSmileOutlineIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsAttachModalOpen(true)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Attach file"
                              >
                                <PaperClipOutlineIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsPollCreatorOpen(true)}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Create poll"
                              >
                                <ChartBarSquareOutlineIcon className="h-4 w-4" />
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

      {/* ✅ Post View Modal */}
      <PostViewModal
        isOpen={isPostViewModalOpen}
        onClose={() => {
          setIsPostViewModalOpen(false);
          setSelectedPost(null);
        }}
        post={selectedPost}
        onLikeToggle={(postId, liked) => {
          // Update post in discover feed if needed
          console.log('Post', postId, liked ? 'liked' : 'unliked');
        }}
        onCommentAdded={(postId) => {
          console.log('Comment added to post', postId);
        }}
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
              : 'Watch Party Chat';

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
                    />
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
                          <img src={session.room_avatar_url} alt={session.room_name} className="w-full h-full object-cover" />
                        ) : (
                          session.room_name?.[0]?.toUpperCase() || 'R'
                        )}
                      </div>
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
                      className="text-2xl font-bold leading-tight line-clamp-2"
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
                      <span className="inline-flex items-center gap-1.5">
                        {session.watch_type === 'classroom' ? (
                          <AcademicCapIcon className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                        ) : session.watch_type === '3d_cinema' ? (
                          <VideoCameraIcon className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                        ) : (
                          <FilmIcon className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }} />
                        )}
                        <span>{watchType.name}</span>
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
                  {/* Content Rating - Neon Outline Frame */}
                  {session.content_rating && (
                    <div 
                      className="w-[45px] h-16 flex items-center justify-center border-2"
                      style={{
                        borderColor: 
                          session.content_rating === 'G' ? 'rgb(74, 222, 128)' :
                          session.content_rating === 'PG' ? 'rgb(96, 165, 250)' :
                          session.content_rating === '13+' ? 'rgb(250, 204, 21)' :
                          session.content_rating === '18+' ? 'rgb(248, 113, 113)' :
                          session.content_rating === 'Mature' ? 'rgb(192, 132, 252)' :
                          'rgb(156, 163, 175)',
                        boxShadow: 
                          session.content_rating === 'G' ? 'inset 0 0 16px rgba(74, 222, 128, 0.3), 0 0 16px rgba(74, 222, 128, 0.7), 0 0 32px rgba(74, 222, 128, 0.5)' :
                          session.content_rating === 'PG' ? 'inset 0 0 16px rgba(96, 165, 250, 0.3), 0 0 16px rgba(96, 165, 250, 0.7), 0 0 32px rgba(96, 165, 250, 0.5)' :
                          session.content_rating === '13+' ? 'inset 0 0 16px rgba(250, 204, 21, 0.3), 0 0 16px rgba(250, 204, 21, 0.7), 0 0 32px rgba(250, 204, 21, 0.5)' :
                          session.content_rating === '18+' ? 'inset 0 0 16px rgba(248, 113, 113, 0.3), 0 0 16px rgba(248, 113, 113, 0.7), 0 0 32px rgba(248, 113, 113, 0.5)' :
                          session.content_rating === 'Mature' ? 'inset 0 0 16px rgba(192, 132, 252, 0.3), 0 0 16px rgba(192, 132, 252, 0.7), 0 0 32px rgba(192, 132, 252, 0.5)' :
                          'inset 0 0 16px rgba(156, 163, 175, 0.3), 0 0 16px rgba(156, 163, 175, 0.7), 0 0 32px rgba(156, 163, 175, 0.5)'
                      }}
                    >
                      <img 
                        src={
                          session.content_rating === 'G' ? '/icons/G Rating Icon.png' :
                          session.content_rating === 'PG' ? '/icons/PG Rating Icon.png' :
                          session.content_rating === '13+' ? '/icons/13_ Rating Icon.png' :
                          session.content_rating === '18+' ? '/icons/18_ Rating Icon.png' :
                          session.content_rating === 'Mature' ? '/icons/Mature Rating Icon.png' :
                          '/icons/G Rating Icon.png'
                        }
                        alt={`${session.content_rating} rating`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  
                  {/* Likes */}
                  <button
                    onClick={(e) => handleSessionLike(session.session_id, e)}
                    className="flex flex-col items-center gap-1.5 group transition-transform hover:scale-110"
                  >
                    <HeartIcon 
                      className={`w-11 h-11 ${
                        sessionLikes[session.session_id]?.isLiked ? 'text-red-500' : 'text-white'
                      }`} 
                      style={{ 
                        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))',
                        fill: sessionLikes[session.session_id]?.isLiked ? 'currentColor' : 'none',
                        stroke: sessionLikes[session.session_id]?.isLiked ? 'none' : 'currentColor',
                        strokeWidth: sessionLikes[session.session_id]?.isLiked ? 0 : 1.5
                      }} 
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
                    <ChatBubbleLeftIcon className="w-11 h-11 text-white" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }} />
                    <span className="text-white text-base font-bold" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                      {formatCount(sessionChatCounts[session.session_id] || 0)}
                    </span>
                  </button>
                  
                  {/* Members */}
                  <div className="flex flex-col items-center gap-1.5">
                    <UsersIcon className="w-11 h-11 text-white" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }} />
                    <span className="text-white text-base font-bold" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                      {formatCount(session.member_count || 0)}
                    </span>
                  </div>
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
      
      {/* ❤️ Heart Animation for likes */}
      {showHeartAnimation && (
        <TikTokHeartAnimation 
          onComplete={() => setShowHeartAnimation(false)}
        />
      )}
    </div>
  );
};

export default LobbyPage;