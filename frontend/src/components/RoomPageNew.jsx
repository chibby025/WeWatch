// WeWatch/frontend/src/components/RoomPageNew.jsx
// Redesigned RoomPage - Hub for room with persistent chat (no video player)
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import StickerPicker from './StickerPicker';
import MentionDropdown from './MentionDropdown';
import logger from '../utils/logger';
import { hasTicketCache } from '../utils/ticketCache';
import {
  ArrowLeftIcon,
  UserIcon,
  ClockIcon,
  FilmIcon,
  EllipsisVerticalIcon,
  ArrowUpIcon,
  MicrophoneIcon as MicrophoneOutlineIcon,
  FaceSmileIcon as FaceSmileOutlineIcon,
  PaperClipIcon as PaperClipOutlineIcon,
  ChartBarSquareIcon as ChartBarSquareOutlineIcon,
  StopCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useMobile } from '../hooks/useMobile';
import apiClient, { editRoomMessage, deleteRoomMessage, getRoomTVContent, createRoomTVContent, deleteRoomTVContent, joinRoom, endWatchSession, getUserAverageWatchers, getRoomGroups, deleteRoomGroup, getAssetUrl, uploadRoomChatAttachment, sendRoomChatSticker } from '../services/api';
import { consumePrefetchedRoom } from '../utils/prefetchCache';
import WatchTypeModal from './WatchTypeModal';
import WatchTypeInfoModal from './WatchTypeInfoModal';
import ClassTypeModal from './modals/ClassTypeModal';
import PricingModal from './PricingModal';
import SetTicketPriceModal from './SetTicketPriceModal';
import TicketPurchaseModal from './payment/TicketPurchaseModal';
import ScheduleEventModal from './ScheduleEventModal';
import RoomPageEditModal from './RoomPageEditModal';
import RoomMembersModal from './RoomMembersModal';
import ShareModal from './ShareModal';
import RoomTV from './RoomTV';
import CreateTVContentModal from './CreateTVContentModal';
import RoomAttachModal from './RoomAttachModal';
import CreatePollModal from './CreatePollModal';
import PollMessage from './PollMessage';
import SessionRatingModal from './SessionRatingModal';
import SessionEarningsModal from './SessionEarningsModal';
import DateOfBirthPromptModal from './DateOfBirthPromptModal';
import RoomPageLeftSidebar from './RoomPageLeftSidebar';
import RoomGroupEditModal from './RoomGroupEditModal';
import RoomJoinRequestsModal from './RoomJoinRequestsModal';
import Coachmark from './Coachmark';
import { checkDateOfBirth, updateDateOfBirth, getRoomJoinRequests } from '../services/api';
import TwemojiText from './TwemojiText';
import { parseTwemoji } from '../utils/twemoji';
// TODO: Review MediaBanner integration later - currently commented out for future use
// import MediaBanner from './MediaBanner';

// Renders a chat message string — highlights @username tokens in purple, then parses emoji SVGs.
// Module-level chat cache — survives tab switches and brief navigations away
// Key: `${roomId}:${groupId||'main'}` → last 50 messages
const _roomChatCache = new Map();

// Safe: non-mention segments are HTML-escaped inside parseTwemoji; mention wrapper uses only /\w+/ chars.
const ChatMessageText = ({ text, className }) => {
  if (!text) return null;
  const parts = text.split(/(@\w+)/g);
  const html = parts.map(part =>
    /^@\w+$/.test(part)
      ? `<span class="text-purple-400 font-semibold">${part}</span>`
      : parseTwemoji(part)
  ).join('');
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

const RoomPageNew = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionAutoOpened = useRef(false);
  const roomTourShown = useRef(false);
  const roomTourBlockedToastShown = useRef(false);
  const beginWatchRef = useRef(null);
  const scheduleIconRef = useRef(null);
  const roomTvIconRef = useRef(null);
  const [showRoomTour, setShowRoomTour] = useState(false);
  const { currentUser, roomMemberships, addRoomMembership, removeRoomMembership } = useAuth();
  const isMobile = useMobile();

  // Room state — seed from navigation state if lobby passed the room object, so we render
  // immediately without a loading spinner and revalidate from the API in the background.
  const _navRoom = location.state?.roomData || null;
  const [room, setRoom] = useState(_navRoom);
  const [loading, setLoading] = useState(!_navRoom);
  const [error, setError] = useState(null);
  const [isHost, setIsHost] = useState(false);

  // Active session state
  const [activeSession, setActiveSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Members state
  const [members, setMembers] = useState([]);
  const [membersInSession, setMembersInSession] = useState([]);
  const [isMember, setIsMember] = useState(false); // ✅ Track if user is a member
  const [joiningRoom, setJoiningRoom] = useState(false); // ✅ Track join action

  // Chat state
  const [messages, setMessages] = useState(() => _roomChatCache.get(`${roomId}:main`) || []);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  // Tracks current cache key (roomId:groupId) so WS handlers can update cache without stale closure
  const chatCacheKeyRef = useRef(`${roomId}:main`);
  const headerRef = useRef(null);
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState(80);
  const [openMenuIndex, setOpenMenuIndex] = useState(null);
  const [openMenuPos, setOpenMenuPos] = useState(null);
  const [pillCopied, setPillCopied] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [showChatPicker, setShowChatPicker] = useState(false);
  const chatPickerRef = useRef(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const chatTextareaRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMention, setHasMention] = useState(false);
  const lastVisibleMessageIndexRef = useRef(null); // Track last visible message when scrolling away
  const [replyingTo, setReplyingTo] = useState(null); // Track message being replied to
  const [swipingMsgIndex, setSwipingMsgIndex] = useState(null);
  const [swipeX, setSwipeX] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  // Voice note state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [audioProgress, setAudioProgress] = useState({});
  const audioRefs = useRef({});

  // Modal state
  const [isWatchTypeModalOpen, setIsWatchTypeModalOpen] = useState(false);
  const [isWatchTypeInfoModalOpen, setIsWatchTypeInfoModalOpen] = useState(false);
  const [isClassTypeModalOpen, setIsClassTypeModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isSetTicketPriceModalOpen, setIsSetTicketPriceModalOpen] = useState(false);
  const [isTicketPurchaseModalOpen, setIsTicketPurchaseModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [showMediaManager, setShowMediaManager] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
  const [isTVContentModalOpen, setIsTVContentModalOpen] = useState(false);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [isCreatePollModalOpen, setIsCreatePollModalOpen] = useState(false);
  const [isRoomImageExpanded, setIsRoomImageExpanded] = useState(false);
  
  // Session rating state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionToRate, setSessionToRate] = useState(null);
  
  // Session earnings state (for hosts)
  const [showEarningsModal, setShowEarningsModal] = useState(false);
  const [sessionEarnings, setSessionEarnings] = useState(null);
  
  // Ticketing flow state
  const [selectedWatchType, setSelectedWatchType] = useState(null);
  const [selectedClassType, setSelectedClassType] = useState(null);
  const [customWatchConfig, setCustomWatchConfig] = useState(null); // { backgroundUrl, region } for 'custom' type
  const [ticketingConfig, setTicketingConfig] = useState({
    ticketing_enabled: false,
    ticket_price_tokens: 0,
    ticket_price_currency: '',
    ticket_price_amount: 0,
    early_bird_enabled: false,
    early_bird_price_tokens: 0,
    early_bird_end_time: null,
  });
  
  // Scheduled events state
  const [scheduledEventsKey, setScheduledEventsKey] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [notifiedEvents, setNotifiedEvents] = useState(new Set());
  const [scheduledEventsCount, setScheduledEventsCount] = useState(0);
  const [hasEventStartingSoon, setHasEventStartingSoon] = useState(false);
  const [scheduleModalTab, setScheduleModalTab] = useState('create');

  // RoomTV state
  const [hostContent, setHostContent] = useState(null);
  const [roomTVRefetchTrigger, setRoomTVRefetchTrigger] = useState(0);
  
  // Host stats state
  const [hostAverageWatchers, setHostAverageWatchers] = useState(0);
  const [loadingHostStats, setLoadingHostStats] = useState(false);
  
  // ✅ Date of Birth state (for age verification)
  const [showDOBModal, setShowDOBModal] = useState(false);
  const [dobSubmitting, setDobSubmitting] = useState(false);
  const [pendingJoinAfterDOB, setPendingJoinAfterDOB] = useState(false);

  // Room Groups state (Discord-style channels for chat segmentation)
  const [roomGroups, setRoomGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null); // null = main chat
  const [loadingGroups, setLoadingGroups] = useState(false);
  // Keep chatCacheKeyRef in sync so WS handlers always write to the right cache slot
  useEffect(() => {
    chatCacheKeyRef.current = `${roomId}:${selectedGroupId || 'main'}`;
  }, [roomId, selectedGroupId]);
  const [isGroupEditModalOpen, setIsGroupEditModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isUserGroupMember, setIsUserGroupMember] = useState(false);

  // TODO: Review media state later - currently commented out for future use
  // const [mediaItems, setMediaItems] = useState([]);
  // const [currentMedia, setCurrentMedia] = useState(null);
  // const [isBannerExpanded, setIsBannerExpanded] = useState(false);

  // WebSocket for room-level communication
  const wsRef = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef(null);
  const isMountedRef = useRef(true); // Track if component is mounted

  // Preload PricingModal content-rating icons on mount so they appear instantly when
  // the host clicks Begin Watch (avoids the visible delay from cold image fetches).
  useEffect(() => {
    [
      '/icons/G Rating Icon.webp',
      '/icons/PG Rating Icon.webp',
      '/icons/Educational_Rating_Icon.webp',
      '/icons/Religious Rating.webp',
      '/icons/13_ Rating Icon.webp',
      '/icons/16_ Rating Icon.webp',
      '/icons/18_ Rating Icon.webp',
      '/icons/Mature Rating Icon.webp',
    ].forEach(src => { const img = new Image(); img.src = src; });
  }, []);

  // Auto-open WatchTypeModal when navigated here with openSession state (from "Watch in Your Room")
  useEffect(() => {
    if (room && isHost && location.state?.openSession && !sessionAutoOpened.current) {
      sessionAutoOpened.current = true;
      setTimeout(() => setIsWatchTypeModalOpen(true), 300);
    }
  }, [room, isHost]);

  // Auto-open ScheduleEventModal when navigated here after claiming a community request
  useEffect(() => {
    if (room && isHost && location.state?.openSchedule) {
      setTimeout(() => {
        setScheduleModalTab('create');
        setIsScheduleModalOpen(true);
      }, 300);
    }
  }, [room, isHost]);

  // Welcome toast when navigated here right after creating this room
  useEffect(() => {
    if (room && location.state?.justCreated) {
      toast.success(
        `🎉 "${location.state.roomName || room.name}" is live! Use it to host watch parties, run classes or meetings, and grow your followers.`,
        { duration: 6000 }
      );
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [room]);

  // One-time coach-mark tour of the header buttons for hosts visiting their own room
  useEffect(() => {
    if (!room || !isHost || roomTourShown.current || localStorage.getItem('wewatch_room_tour_seen')) return;
    if (activeSession) {
      // Begin Watch / Schedule / RoomTV are hidden while a session is live, so the
      // tour has nothing to point at — tell the host why instead of doing nothing.
      // Don't mark roomTourShown yet: retry once the session ends.
      if (!roomTourBlockedToastShown.current) {
        roomTourBlockedToastShown.current = true;
        toast('End your active session to see the room tour', { icon: '👋', duration: 4000 });
      }
      return;
    }
    roomTourShown.current = true;
    const t = setTimeout(() => setShowRoomTour(true), 600);
    return () => clearTimeout(t);
  }, [room, isHost, activeSession]);

  // ✅ INSTANT membership check from auth context
  useEffect(() => {
    if (roomMemberships && roomMemberships.length > 0) {
      const numRoomId = Number(roomId);
      const isMemberFromAuth = roomMemberships.includes(numRoomId);
      if (isMemberFromAuth) {
        console.log('✅ [RoomPageNew] Instant membership confirmed from auth context for room', numRoomId);
        setIsMember(true);
      }
    }
  }, [roomMemberships, roomId]);

  // Measure fixed mobile header height so sidebar + messages clear it exactly
  useEffect(() => {
    if (!isMobile || !headerRef.current) return;
    const el = headerRef.current;
    const update = () => setMobileHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  // Track activeSession state changes
  useEffect(() => {
    console.log('🔄 [Session State]', {
      hasSession: !!activeSession,
      sessionId: activeSession?.session_id || activeSession?.id || 'none',
      watchType: activeSession?.watch_type || 'none',
      memberCount: activeSession?.members?.length || 0
    });
  }, [activeSession]);
  
  // ✅ Helper: Get age requirement message based on content rating
  const getAgeRequirementMessage = (contentRating) => {
    const ratings = {
      'G': null, // No restriction
      'PG': null, // No restriction
      '13+': 'This session is rated 13+ and requires viewers to be 13 or older',
      '16+': 'This session is rated 16+ and requires viewers to be 16 or older',
      '18+': 'This session is rated 18+ and requires viewers to be 18 or older',
      'Mature': 'This session is rated Mature and requires viewers to be 18 or older'
    };
    return ratings[contentRating] || null;
  };
  
  // ✅ Helper: Check if user can view content based on age
  const canUserViewContent = (contentRating, userAge) => {
    if (!contentRating || contentRating === 'G' || contentRating === 'PG') return true;
    if (userAge === null) return false; // No DOB set
    
    const requirements = {
      '13+': 13,
      '16+': 16,
      '18+': 18,
      'Mature': 18
    };
    
    const required = requirements[contentRating];
    return required ? userAge >= required : true;
  };
  
  // ✅ Handle DOB submission
  const handleDOBSubmit = async (dateOfBirth) => {
    setDobSubmitting(true);
    try {
      await updateDateOfBirth(dateOfBirth);
      
      // ✅ Refresh user data from backend to get computed age field
      if (refreshUser) {
        await refreshUser();
      }
      
      toast.success('Date of birth saved');
      setShowDOBModal(false);
      
      // If user was trying to join, retry now
      if (pendingJoinAfterDOB) {
        setPendingJoinAfterDOB(false);
        setTimeout(() => handleJoinSession(), 500);
      }
    } catch (err) {
      console.error('Failed to save DOB:', err);
      toast.error('Failed to save date of birth');
    } finally {
      setDobSubmitting(false);
    }
  };

  // ✅ Refetch session when page becomes visible (catches missed session_ended messages)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isMountedRef.current) {
        console.log('👁️ [RoomPageNew] Page became visible - refetching session state');
        fetchActiveSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Check for upcoming events and show reminders
  useEffect(() => {
    if (upcomingEvents.length === 0) return;

    const checkUpcomingEvents = () => {
      const now = new Date();
      
      upcomingEvents.forEach(event => {
        const eventTime = new Date(event.start_time);
        const timeUntilEvent = eventTime - now;
        const minutesUntilEvent = Math.floor(timeUntilEvent / 60000);
        
        // Create unique key for this notification
        const notificationKey = `${event.ID}-${minutesUntilEvent}`;
        
        // Show notification at 5 minutes and 1 minute before event
        if ((minutesUntilEvent === 5 || minutesUntilEvent === 1) && !notifiedEvents.has(notificationKey)) {
          // Mark as notified
          setNotifiedEvents(prev => {
            const next = new Set([...prev, notificationKey]);
            if (next.size > 50) { const [oldest] = next; next.delete(oldest); }
            return next;
          });
          
          // Show in-app toast notification
          toast(`📅 Event "${event.title}" starts in ${minutesUntilEvent} minute${minutesUntilEvent > 1 ? 's' : ''}!`, {
            duration: 10000,
            icon: '⏰',
          });
          
          // Show browser notification if permission granted
          if (notificationPermission === 'granted') {
            new Notification('LetsWatchOut - Scheduled Event', {
              body: `"${event.title}" starts in ${minutesUntilEvent} minute${minutesUntilEvent > 1 ? 's' : ''}!`,
              icon: '/icons/seat.svg',
              badge: '/icons/seat.svg',
              tag: `event-${event.ID}`,
            });
          }
        }
        
        // Show notification when event starts
        if (minutesUntilEvent === 0 && !notifiedEvents.has(`${event.ID}-start`)) {
          setNotifiedEvents(prev => new Set([...prev, `${event.ID}-start`]));
          
          toast.success(`🎬 Event "${event.title}" is starting now!`, {
            duration: 15000,
          });
          
          if (notificationPermission === 'granted') {
            new Notification('LetsWatchOut - Event Starting!', {
              body: `"${event.title}" is starting now!`,
              icon: '/icons/seat.svg',
              badge: '/icons/seat.svg',
              tag: `event-${event.ID}-start`,
              requireInteraction: true,
            });
          }
        }
      });
    };
    
    // Check every 30 seconds
    const interval = setInterval(checkUpcomingEvents, 30000);
    
    // Check immediately on mount
    checkUpcomingEvents();
    
    return () => clearInterval(interval);
  }, [upcomingEvents, notificationPermission, notifiedEvents]);

  // Fetch room data on mount
  useEffect(() => {
    isMountedRef.current = true;
    
    fetchRoomData();
    fetchActiveSession();
    fetchMembers();
    fetchRoomMessages();
    fetchTVContent();
    fetchScheduledEvents();
    fetchRoomGroups(); // ✅ Fetch room groups for sidebar
    connectWebSocket();

    const interval = setInterval(() => {
      fetchActiveSession();
      fetchMembers();
      fetchTVContent();
    }, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      wsConnectedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Clean up cached data no longer needed after leaving the room
      sessionStorage.removeItem('lecture_hall_seats');
    };
  }, [roomId]);

  // ✅ Pre-load lecture hall assets when classroom session detected
  useEffect(() => {
    if (!activeSession || activeSession.watch_type !== 'classroom') {
      return;
    }

    console.log('🎓 [RoomPageNew] Classroom session detected - pre-loading lecture hall assets');

    // Pre-load seats JSON (if not already cached)
    const cachedSeats = sessionStorage.getItem('lecture_hall_seats');
    if (!cachedSeats) {
      console.log('📥 [RoomPageNew] Fetching lecture hall seats JSON...');
      fetch('/lecture_hall_seats_final.json')
        .then(res => res.json())
        .then(data => {
          sessionStorage.setItem('lecture_hall_seats', JSON.stringify(data));
          console.log(`✅ [RoomPageNew] Lecture hall seats cached (${data.length} seats)`);
        })
        .catch(err => {
          console.error('❌ [RoomPageNew] Failed to pre-load seats:', err);
        });
    } else {
      console.log('✅ [RoomPageNew] Lecture hall seats already cached');
    }

    // Pre-fetch 3D model using link prefetch (browser-native optimization)
    const modelUrl = '/models/lecture_hall.glb'; // Adjust path as needed
    const existingLink = document.querySelector(`link[rel="prefetch"][href="${modelUrl}"]`);
    
    if (!existingLink) {
      console.log('📥 [RoomPageNew] Adding prefetch link for 3D model');
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'fetch';
      link.href = modelUrl;
      document.head.appendChild(link);
      console.log('✅ [RoomPageNew] 3D model prefetch initiated');
    } else {
      console.log('✅ [RoomPageNew] 3D model already prefetched');
    }
  }, [activeSession]);

  const fetchRoomData = async () => {
    try {
      const prefetched = consumePrefetchedRoom(roomId);
      // Only block render with a spinner when we have no seed data at all.
      // If the user navigated from lobby (room data in state) or prefetch hit, render immediately.
      if (!prefetched && !room) setLoading(true);
      const responseData = prefetched || (await apiClient.get(`/api/rooms/${roomId}`)).data;
      const roomData = responseData.room;
      setRoom(roomData);
      const userIsHost = currentUser?.id === roomData.host_id;
      setIsHost(userIsHost);

      // Fetch pending join request count for host (private rooms)
      if (userIsHost && !roomData.is_public) {
        getRoomJoinRequests(roomId)
          .then(r => setPendingJoinCount(r.data.count || 0))
          .catch(() => {});
      }
      
      console.log('🔍 [RoomPageNew] fetchRoomData - Host check:');
      console.log('  currentUser.id:', currentUser?.id, 'type:', typeof currentUser?.id);
      console.log('  roomData.host_id:', roomData.host_id, 'type:', typeof roomData.host_id);
      console.log('  userIsHost:', userIsHost);
      
      // ✅ Host is always considered a member
      if (userIsHost) {
        console.log('  Setting isMember=true for host');
        setIsMember(true);
      }
      
      // ✅ Fetch host's average watchers
      if (roomData.host_id) {
        setLoadingHostStats(true);
        console.log('📊 [RoomPageNew] Fetching average watchers for host:', roomData.host_id);
        try {
          const statsResponse = await getUserAverageWatchers(roomData.host_id);
          console.log('📊 [RoomPageNew] Host stats response:', statsResponse.data);
          // Just set the value - backend determines if they've hosted sessions
          setHostAverageWatchers(statsResponse.data.average_watchers || 0);
        } catch (err) {
          console.error('❌ [RoomPageNew] Failed to fetch host stats:', err);
        } finally {
          setLoadingHostStats(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch room:', err);
      if (err.response?.status === 404) {
        setError('room_not_found');
      } else {
        setError('Failed to load room data');
        toast.error('Failed to load room');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveSession = async () => {
    // ✅ ALWAYS check for pending rating (even if no session_ended flag)
    const pendingRating = sessionStorage.getItem(`pending_rating_${roomId}`);
    if (pendingRating) {
      try {
        const ratingData = JSON.parse(pendingRating);
        console.log('⭐ [RoomPageNew] Found pending rating - showing modal');
        setSessionToRate(ratingData);
        setShowRatingModal(true);
        sessionStorage.removeItem(`pending_rating_${roomId}`);
      } catch (error) {
        console.error('❌ [RoomPageNew] Failed to parse pending rating:', error);
        sessionStorage.removeItem(`pending_rating_${roomId}`);
      }
    }
    
    // ✅ Check if session was just ended via "Leave Call" button
    const sessionEndedFlag = sessionStorage.getItem(`session_ended_${roomId}`);
    if (sessionEndedFlag === 'true') {
      console.log('🛑 [RoomPageNew] Session was explicitly ended - clearing state');
      sessionStorage.removeItem(`session_ended_${roomId}`);
      setActiveSession(null);
      setMembersInSession([]);
      setSessionLoading(false);
      return;
    }
    
    try {
      setSessionLoading(true);

      const response = await apiClient.get(`/api/rooms/${roomId}/active-session`, {
        timeout: 8000,
      });
      
      // Backend returns session data at root level
      if (response.data.session_id) {
        console.log('✅ [RoomPageNew] Active session found:', response.data.session_id);
        
        // Validate session age / zombie state
        const sessionStartTime = new Date(response.data.started_at);
        const sessionAgeMins = (Date.now() - sessionStartTime.getTime()) / (1000 * 60); // minutes
        const sessionAgeHours = sessionAgeMins / 60;
        const isSessionHost = response.data.host_id === currentUser?.id;

        // Zombie: host's session, nobody connected for ≥30 min (token expiry / abrupt leave)
        const isZombie = isSessionHost &&
                          response.data.ws_connection_count === 0 &&
                          response.data.member_count === 0 &&
                          sessionAgeMins >= 30;

        if (sessionAgeHours > 4 || isZombie) {
          const reason = sessionAgeHours > 4 ? `${sessionAgeHours.toFixed(1)}h old` : 'no active members';
          console.warn(`⚠️ [RoomPageNew] Clearing stale session (${reason}):`, response.data.session_id);
          try {
            await apiClient.post(`/api/rooms/${roomId}/sessions/${response.data.session_id}/end`);
            toast('Cleared interrupted session', { icon: '🧹' });
          } catch (endError) {
            console.error('Failed to end stale session:', endError);
          }
          setActiveSession(null);
          setMembersInSession([]);
        } else {
          console.log('📌 [RoomPageNew] Setting activeSession state with valid session data');
          setActiveSession(response.data);
          setMembersInSession(response.data.members || []);
        }
      } else {
        console.log('ℹ️ [RoomPageNew] No active session found - setting to null');
        setActiveSession(null);
        setMembersInSession([]);
      }
    } catch (err) {
      const isTimeout = err?.code === 'ECONNABORTED' || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
      const is404 = err?.response?.status === 404;
      if (is404) {
        // Definitive "no session" response
        console.log('ℹ️ [RoomPageNew] No active session (404) - clearing state');
        setActiveSession(null);
        setMembersInSession([]);
      } else if (isTimeout) {
        // Railway timeout — preserve whatever we already know; don't null the session
        console.warn('⚠️ [RoomPageNew] fetchActiveSession timed out — keeping current activeSession state');
      } else {
        // Other network error — also preserve state rather than falsely clearing
        console.warn('⚠️ [RoomPageNew] fetchActiveSession error — keeping current state:', err?.message);
      }
    } finally {
      setSessionLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/members`);
      const membersList = response.data.members || [];
      setMembers(membersList);
      
      // ✅ Check if current user is a member (validates auth context)
      if (currentUser && currentUser.id) {
        const userIsMember = membersList.some(member => member.id === currentUser.id);
        
        // ✅ Only update if different from current state (avoids unnecessary re-renders)
        setIsMember(prev => {
          if (prev !== userIsMember) {
            console.log('📝 [RoomPageNew] Membership changed:', userIsMember);
            return userIsMember;
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  };

  const fetchRoomMessages = async () => {
    const cacheKey = `${roomId}:main`;
    const cached = _roomChatCache.get(cacheKey);
    if (cached?.length) setMessages(cached);
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/messages`);
      const msgs = response.data.messages || [];
      console.log('📨 [Reply Debug] Fetched messages:', msgs);
      console.log('📨 [Reply Debug] First message structure:', msgs[0]);
      const msgsWithReply = msgs.filter(m => m.reply_to);
      console.log('📨 [Reply Debug] Messages with reply_to:', msgsWithReply.length, msgsWithReply);
      const capped = msgs.length > 200 ? msgs.slice(msgs.length - 200) : msgs;
      _roomChatCache.set(cacheKey, capped.slice(-50));
      setMessages(capped);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const fetchTVContent = async () => {
    const token = sessionStorage.getItem('wewatch_ws_token');
    if (!token) {
      // Silent skip - auth not ready yet
      return;
    }

    try {
      // Pass session_id if active session exists to get session-specific content
      const sessionParam = activeSession?.session_id ? `?session_id=${activeSession.session_id}` : '';
      const url = `/api/rooms/${roomId}/tv-content${sessionParam}`;
      
      // Use apiClient instead of fetch to get proper API URL detection and headers
      const response = await apiClient.get(url);
      const data = response.data;
      
      if (data) {
        console.log('📺 [RoomTV] Active content:', data.title || data.content_type);
      } else {
        console.log('📺 [RoomTV] No active content in room');
      }
      
      setHostContent(data);
    } catch (err) {
      // Silent - only critical errors logged
      if (err.message && !err.message.includes('404') && !err.message.includes('401')) {
        console.error('❌ [RoomTV] Fetch error:', err.message);
      }
    }
  };

  const fetchScheduledEvents = async () => {
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/scheduled-events`);
      const events = response.data.events || [];
      // Keep all upcoming events (removed 1-hour filter)
      const upcoming = events.filter(event => {
        const eventTime = new Date(event.start_time);
        const now = new Date();
        return eventTime > now; // Only future events
      });
      setUpcomingEvents(upcoming);
      setScheduledEventsCount(upcoming.length);
      
      // Check if any event is starting within 15 minutes
      const now = new Date();
      const hasStartingSoon = upcoming.some(event => {
        const eventTime = new Date(event.start_time);
        const timeDiff = (eventTime - now) / 1000 / 60; // minutes
        return timeDiff <= 15 && timeDiff >= 0;
      });
      setHasEventStartingSoon(hasStartingSoon);
    } catch (err) {
      console.error('Failed to fetch scheduled events:', err);
    }
  };

  // Fetch room groups for chat segmentation
  const fetchRoomGroups = async () => {
    if (!roomId) return;
    
    try {
      setLoadingGroups(true);
      console.log('[Room Groups] Fetching groups for room:', roomId);
      const response = await getRoomGroups(roomId);
      console.log('[Room Groups] Received response:', response.data);
      setRoomGroups(response.data.groups || []);
      console.log('[Room Groups] Set groups count:', response.data.groups?.length || 0);
    } catch (err) {
      console.error('[Room Groups] Failed to fetch:', err);
      console.error('[Room Groups] Error details:', err.response?.data || err.message);
      // Silent fail - groups are optional feature
    } finally {
      setLoadingGroups(false);
    }
  };

  // Handle group selection
  const handleGroupSelect = (groupId) => {
    setSelectedGroupId(groupId);
    // Only blank out if this group has no cache — fetchMessagesForGroup will serve cache instantly
    if (!_roomChatCache.get(`${roomId}:${groupId || 'main'}`)?.length) setMessages([]);
    fetchMessagesForGroup(groupId);
  };

  // Handle group deletion from sidebar
  const handleDeleteGroupFromSidebar = async (groupId) => {
    try {
      await deleteRoomGroup(roomId, groupId);
      toast.success('Group deleted');
      // Refetch groups
      fetchRoomGroups();
      // If deleted group was selected, switch to main chat
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
        fetchMessagesForGroup(null);
      }
    } catch (err) {
      console.error('Failed to delete group:', err);
      toast.error('Failed to delete group');
    }
  };

  // Handle opening group edit modal
  const handleGroupEdit = (group) => {
    setSelectedGroup(group);
    // Check if user is a member of this group
    const isMember = group.is_member || false;
    setIsUserGroupMember(isMember);
    setIsGroupEditModalOpen(true);
  };

  // Handle group updates
  const handleGroupUpdate = () => {
    fetchRoomGroups();
  };

  // Handle group deletion from modal
  const handleGroupDelete = () => {
    fetchRoomGroups();
    if (selectedGroupId === selectedGroup?.id) {
      setSelectedGroupId(null);
      fetchMessagesForGroup(null);
    }
  };

  // Handle joining a group
  const handleGroupJoin = () => {
    setIsUserGroupMember(true);
    fetchRoomGroups();
  };

  // Handle leaving a group
  const handleGroupLeave = () => {
    setIsUserGroupMember(false);
    fetchRoomGroups();
    if (selectedGroupId === selectedGroup?.id) {
      setSelectedGroupId(null);
      fetchMessagesForGroup(null);
    }
  };

  // Fetch messages for specific group (or main chat if null)
  const fetchMessagesForGroup = async (groupId) => {
    const cacheKey = `${roomId}:${groupId || 'main'}`;
    const cached = _roomChatCache.get(cacheKey);
    if (cached?.length) setMessages(cached);
    try {
      const url = groupId
        ? `/api/rooms/${roomId}/messages?room_group_id=${groupId}`
        : `/api/rooms/${roomId}/messages?room_group_id=null`;
      const response = await apiClient.get(url);
      const msgs = response.data.messages || [];
      const capped = msgs.length > 200 ? msgs.slice(msgs.length - 200) : msgs;
      _roomChatCache.set(cacheKey, capped.slice(-50));
      setMessages(capped);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      toast.error('Failed to load messages');
    }
  };

  const connectWebSocket = () => {
    console.log(`🔌 [RoomPageNew] connectWebSocket called for room ${roomId}`);
    
    try {
      // Prevent duplicate connections
      if (wsConnectedRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)) {
        console.log('⚠️ [RoomPageNew] WebSocket already connected or connecting, skipping...');
        console.log(`📊 [RoomPageNew] Current state: wsConnected=${wsConnectedRef.current}, readyState=${wsRef.current?.readyState}`);
      return;
    }

    // Connect to room-level WebSocket for presence and chat updates
    // ✅ FIX: Use WebSocket token from useAuth (key: wewatch_ws_token)
    // This matches the key used by useAuth.js when storing the token
    const wsToken = sessionStorage.getItem('wewatch_ws_token');
    if (!wsToken) {
      console.error('❌ [RoomPageNew] No auth token available for WebSocket connection');
      console.error('📍 [RoomPageNew] sessionStorage keys:', Object.keys(sessionStorage));
      return;
    }

    // Log token info (first/last 10 chars for security)
    const tokenPreview = `${wsToken.substring(0, 10)}...${wsToken.substring(wsToken.length - 10)}`;
    console.log(`🔑 [RoomPageNew] Using auth token: ${tokenPreview}`);
    console.log(`📊 [RoomPageNew] Token length: ${wsToken.length} chars`);

    // ✅ FIX: Use API backend URL (Railway/localhost) instead of window.location (Vercel)
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
    const apiUrl = new URL(apiBaseUrl);
    const protocol = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
    const host = apiUrl.hostname;
    const port = apiUrl.port ? `:${apiUrl.port}` : '';
    
    // Build WebSocket URL using backend domain (Railway in production, localhost in dev)
    const wsUrl = `${protocol}://${host}${port}/api/rooms/${roomId}/ws?token=${encodeURIComponent(wsToken)}`;
    
    console.log(`🔧 [RoomPageNew] Backend URL: ${apiBaseUrl}`);
    console.log(`🔧 [RoomPageNew] WebSocket protocol: ${protocol}, host: ${host}, port: ${port}`);
    console.log(`🌐 [RoomPageNew] Full WebSocket URL: ${wsUrl.split('?')[0]}`);
    console.log(`📍 [RoomPageNew] Component mounted: ${isMountedRef.current}`);

    // Remove the old duplicate logs below

    // ⚠️ DON'T add session_id here - this WebSocket is for ROOM chat/presence only
    // Session membership is handled by CinemaScene3D/useWebSocket when user clicks "Join"

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ [RoomPageNew] Room WebSocket connected successfully');
      console.log('📊 [RoomPageNew] Connection details:', {
        roomId,
        readyState: ws.readyState,
        protocol: ws.protocol,
        url: ws.url.split('?')[0], // Hide token in logs
        componentMounted: isMountedRef.current
      });
      wsConnectedRef.current = true;
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        logger.debug('📨 [RoomPageNew] Received message:', {
          type: message.type,
          hasData: !!message.data,
          dataKeys: message.data ? Object.keys(message.data) : [],
          messageSize: event.data.length
        });
        handleWebSocketMessage(message);
      } catch (err) {
        logger.error('❌ [RoomPageNew] Failed to parse WebSocket message');
        logger.error('🔍 [RoomPageNew] Parse error:', err);
        logger.error('📄 [RoomPageNew] Raw message data:', event.data.substring(0, 200));
        logger.error('📊 [RoomPageNew] Message size: ${event.data.length} bytes');
      }
    };

    ws.onerror = (error) => {
      console.error('❌ [RoomPageNew] WebSocket error occurred');
      console.error('🔍 [RoomPageNew] Error details:', {
        type: error.type,
        target: error.target?.url?.split('?')[0], // Hide token
        readyState: error.target?.readyState,
        componentMounted: isMountedRef.current,
        wsConnectedRef: wsConnectedRef.current
      });
      console.error('📊 [RoomPageNew] Full error object:', error);
      
      // Check if this is a connection refused error
      if (error.target?.readyState === WebSocket.CLOSED) {
        console.error('🚫 [RoomPageNew] Connection was closed before establishing');
      }
    };

    ws.onclose = (event) => {
      console.log('🔌 [RoomPageNew] Room WebSocket disconnected');
      console.log('📊 [RoomPageNew] Close event details:', {
        code: event.code,
        reason: event.reason || '(no reason provided)',
        wasClean: event.wasClean,
        componentMounted: isMountedRef.current,
        wsConnectedRef: wsConnectedRef.current
      });
      
      // Diagnose close code
      const closeCodeMeanings = {
        1000: 'Normal Closure',
        1001: 'Going Away',
        1002: 'Protocol Error',
        1003: 'Unsupported Data',
        1005: 'No Status Received',
        1006: 'Abnormal Closure',
        1007: 'Invalid Payload',
        1008: 'Policy Violation (likely auth failure)',
        1009: 'Message Too Big',
        1010: 'Missing Extension',
        1011: 'Internal Server Error',
        1015: 'TLS Handshake Failed'
      };
      console.log(`🔍 [RoomPageNew] Close code meaning: ${closeCodeMeanings[event.code] || 'Unknown'}`);
      
      wsConnectedRef.current = false;
      setWsConnected(false);
      wsRef.current = null;
      
      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        console.log('🧹 [RoomPageNew] Clearing existing reconnect timeout');
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // ⚠️ CRITICAL FIX: Only reconnect if component is still mounted
      // This prevents zombie reconnects when user navigates to 3D cinema
      if (!isMountedRef.current) {
        console.log('🛑 [RoomPageNew] Component unmounted, skipping WebSocket reconnect');
        // console.log('✅ [RoomPageNew] Successfully prevented zombie reconnection');
        return;
      }

      // 🔒 AUTH FIX: Don't reconnect on authentication failures (401)
      // Close code 1008 = policy violation (includes auth failures)
      // This prevents infinite reconnection loops with expired tokens
      if (event.code === 1008 || event.reason === 'Authentication failed') {
        console.warn('🔒 [RoomPageNew] WebSocket closed due to authentication failure - not reconnecting');
        console.warn('⚠️ [RoomPageNew] User action required: Please refresh the page to get a new token');
        console.warn('🔍 [RoomPageNew] Token in sessionStorage:', {
          hasToken: !!sessionStorage.getItem('wewatch_ws_token'),
          tokenLength: sessionStorage.getItem('wewatch_ws_token')?.length || 0
        });
        return;
      }
      
      // Check for abnormal closure without clean disconnect
      if (event.code === 1006) {
        console.warn('⚠️ [RoomPageNew] Abnormal closure detected (1006) - connection lost unexpectedly');
      }
      
      // Attempt reconnect after 5 seconds (increased from 3 for stability)
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connectWebSocket();
        }
      }, 5000);
    };
    } catch (error) {
      console.error('💥 [RoomPageNew] UNEXPECTED ERROR in connectWebSocket');
      console.error('🔍 [RoomPageNew] Error name:', error.name);
      console.error('📄 [RoomPageNew] Error message:', error.message);
      console.error('📚 [RoomPageNew] Error stack:', error.stack);
      console.error('📊 [RoomPageNew] State at error:', {
        roomId,
        componentMounted: isMountedRef.current,
        wsConnected: wsConnectedRef.current,
        hasWsRef: !!wsRef.current,
        wsReadyState: wsRef.current?.readyState
      });
      
      // Reset state on error
      wsConnectedRef.current = false;
      setWsConnected(false);
      wsRef.current = null;
      
      // Try to reconnect after error if component is still mounted
      if (isMountedRef.current) {
        console.log('🔄 [RoomPageNew] Scheduling reconnect after error in 10 seconds...');
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            console.log('🔄 [RoomPageNew] Reconnecting after error...');
            connectWebSocket();
          }
        }, 10000); // Longer delay after error
      }
    }
  };

  const handleWebSocketMessage = (message) => {
    try {
      // ✅ Log ALL incoming messages for debugging
      console.log('📬 [RoomPageNew] WebSocket message received:', {
        type: message.type,
        hasData: !!message.data,
        fullMessage: message
      });
      
      logger.debug(`📬 [RoomPageNew] Handling message type: ${message.type}`);
      
      switch (message.type) {
        case 'room_chat':
          console.log('📨 [Reply Debug] WebSocket room_chat data:', message.data);
          if (message.data.reply_to) {
            console.log('📨 [Reply Debug] Message has reply_to:', message.data.reply_to);
          }
          
          // ✅ Filter messages by selected group
          const messageGroupId = message.data.room_group_id || null;
          const shouldShowMessage = selectedGroupId === messageGroupId;
          
          if (!shouldShowMessage) {
            console.log('🚫 [Groups] Filtering out message from different group:', {
              messageGroupId,
              selectedGroupId,
              messageText: message.data.message?.substring(0, 50)
            });
            break; // Don't add message to display
          }
          
          setMessages(prev => {
            const id = message.data?.id || message.data?.ID;
            const existingIds = prev.map(m => m.id || m.ID);
            if (id && existingIds.includes(id)) return prev;
            const next = [...prev, message.data];
            const capped = next.length > 200 ? next.slice(next.length - 200) : next;
            _roomChatCache.set(chatCacheKeyRef.current, capped.slice(-50));
            return capped;
          });

          // Check if user is scrolled up — if so, track unread and @mentions
          if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
            if (!isAtBottom) {
              setUnreadCount(prev => prev + 1);
              const msgText = message.data.message || '';
              if (currentUser?.username && msgText.toLowerCase().includes(`@${currentUser.username.toLowerCase()}`)) {
                setHasMention(true);
              }
            } else {
              scrollToBottom();
            }
          } else {
            scrollToBottom();
          }
          break;
        case 'user_joined':
          toast.success(`${message.data.username} joined the room`);
          fetchMembers();
          break;
        case 'user_left':
          toast(`${message.data.username} left the room`);
          fetchMembers();
          break;
        case 'session_started':
          toast.success('Watch session started!');
          fetchActiveSession();
          break;
        case 'room_join_request':
          // Increment pending badge for host
          setPendingJoinCount(prev => prev + 1);
          toast(`${message.data?.username || 'Someone'} wants to join your room`, { icon: '🔔' });
          break;
        case 'kicked_from_room': {
          const kickReason = message.data?.reason;
          if (kickReason === 'banned') {
            toast.error('You have been banned from this room');
          } else {
            toast.error('You have been removed from this room by the host');
          }
          setTimeout(() => navigate('/lobby'), 1500);
          break;
        }
        case 'session_ended':
          logger.debug('🛑 [RoomPageNew] SESSION_ENDED message received:', {
            reason: message.data?.reason,
            sessionId: message.data?.session_id,
            currentActiveSession: activeSession?.id || 'none',
            timestamp: new Date().toISOString()
          });
          
          const reason = message.data?.reason;
          if (reason === 'host_timeout') {
            toast('Watch session ended - Host disconnected', { icon: '⏰', id: 'session-ended' });
          } else {
            toast('Watch session ended', { id: 'session-ended' });
          }
          
          // ✅ Show rating modal for ALL sessions (not just paid) but exclude the host
          const isCurrentUserHost = currentUser?.id === message.data?.host_id;
          if (message.data?.session_id && !isCurrentUserHost) {
            logger.debug('⭐ [RoomPageNew] Session ended - showing rating modal (user is not host)');
            setSessionToRate({
              sessionId: message.data.session_id,
              hostId: message.data.host_id,
              hostName: message.data.host_name || room?.host?.username || 'Unknown Host',
              sessionTitle: message.data.session_title || activeSession?.title || 'Untitled Session',
              watchType: message.data.watch_type,
              isTemporary: message.data.is_temporary, // Store for future use (e.g., redirect after rating)
            });
            setShowRatingModal(true);
          } else if (isCurrentUserHost) {
            logger.debug('⭐ [RoomPageNew] Session ended but user is host - skipping rating modal');
          }
          
          // ✅ Immediately clear active session state (critical for RoomTV update)
          logger.debug('🧹 [RoomPageNew] Clearing activeSession state to null');
          setActiveSession(null);
          setMembersInSession([]);
          
          // ✅ Refetch to ensure backend sync (backup in case state gets stale)
          logger.debug('🔄 [RoomPageNew] Refetching activeSession from backend');
          fetchActiveSession();
          break;
        case 'scheduled_event_created':
          toast.success(`📅 New event scheduled: ${message.event?.title}`);
          fetchScheduledEvents();
          break;
        case 'event_created':
        case 'event_deleted':
        case 'event_updated':
          // Real-time updates from lobby WebSocket
          fetchScheduledEvents();
          break;
        case 'room_tv_content_created':
          console.log('📺 [RoomTV] Received content_created message:', JSON.stringify(message, null, 2));
          console.log('📺 [RoomTV] message.content:', message.content);
          console.log('📺 [RoomTV] message.data:', message.data);
          setHostContent(message.content);
          toast.success('📺 Host posted new content');
          break;
        case 'room_tv_content_removed':
          console.log('📺 [RoomTV] Received content_removed message:', message);
          setHostContent(null);
          break;
        case 'room_post_created':
          console.log('🎬 [POST NOTIFICATION] Received:', {
            room_id: message.room_id,
            post_id: message.data?.post_id,
            author: message.data?.author?.username,
            title: message.data?.title,
            timestamp: message.timestamp
          });
          toast.success(`🎬 New post from ${message.data?.author?.username || 'host'}!`);
          // Trigger RoomTV to refetch posts
          setRoomTVRefetchTrigger(prev => prev + 1);
          break;
        default:
          logger.debug(`⚠️ [RoomPageNew] Unhandled message type: ${message.type}`);
          break;
      }
      
      logger.debug('✅ [RoomPageNew] Message handled successfully');
    } catch (error) {
      logger.error('❌ [RoomPageNew] Error handling WebSocket message');
      console.error('🔍 [RoomPageNew] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      console.error('📄 [RoomPageNew] Message that caused error:', message);
      console.error('📊 [RoomPageNew] Message type:', message.type);
      console.error('📦 [RoomPageNew] Message data:', message.data);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
    setHasMention(false);
  };

  // Check if user is at bottom of messages
  const checkScrollPosition = () => {
    if (!messagesContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100; // 100px threshold
    setShowScrollButton(!isAtBottom);
    
    // Reset unread count when user manually scrolls to bottom
    if (isAtBottom && unreadCount > 0) {
      setUnreadCount(0);
    }
    
    // Track the last visible message index when scrolling away from bottom
    if (!isAtBottom && lastVisibleMessageIndexRef.current === null) {
      lastVisibleMessageIndexRef.current = messages.length - 1;
    } else if (isAtBottom) {
      lastVisibleMessageIndexRef.current = null;
    }
  };

  // Monitor scroll position
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', checkScrollPosition);
    // Check initial position
    checkScrollPosition();

    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
    };
  }, [messages, unreadCount]);

  // Intersection Observer to detect when messages come into view
  useEffect(() => {
    if (messages.length === 0 || unreadCount === 0) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    // Observe the last few messages that are considered "unread"
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Message came into view, decrement unread count
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        });
      },
      {
        root: container,
        threshold: 0.5, // Consider visible when 50% of message is in view
      }
    );

    // Observe the last N messages (where N = unreadCount)
    const messageElements = container.querySelectorAll('[data-message-index]');
    const startIndex = Math.max(0, messageElements.length - unreadCount);
    
    for (let i = startIndex; i < messageElements.length; i++) {
      observer.observe(messageElements[i]);
    }

    return () => {
      observer.disconnect();
    };
  }, [messages, unreadCount]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (room?.host_only_chat && !isHost) {
      toast.error('Chat is locked. Only the host can send messages.');
      return;
    }

    // Capture before clearing so we can restore on error
    const msgToSend = newMessage;
    const replyContext = replyingTo;

    // Clear input immediately — snappy UX
    setNewMessage('');
    setReplyingTo(null);
    setShowChatPicker(false);

    try {
      const response = await apiClient.post(`/api/rooms/${roomId}/messages`, {
        message: msgToSend,
        reply_to_id: replyContext?.id || null,
        room_group_id: selectedGroupId || null,
      });

      const serverMsg = response.data?.message;
      const newId = serverMsg?.id || serverMsg?.ID;
      // Only add if the WS broadcast hasn't already inserted it (WS often beats the HTTP response)
      setMessages(prev => {
        const existingIds = prev.map(m => m.id || m.ID);
        if (newId && existingIds.includes(newId)) return prev;
        const next = [...prev, {
          id: newId || Date.now(),
          user_id: currentUser?.id,
          username: currentUser?.username,
          message: msgToSend,
          created_at: serverMsg?.created_at || new Date().toISOString(),
          reply_to: replyContext
            ? { id: replyContext.id, username: replyContext.username, message: replyContext.message }
            : null,
          room_group_id: selectedGroupId,
        }];
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
      scrollToBottom();
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
      // Restore input on failure
      setNewMessage(msgToSend);
      setReplyingTo(replyContext);
    }
  };

  const handleEmojiClick = (emoji) => {
    setNewMessage(prev => prev + emoji);
  };

  // Close combined chat picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (chatPickerRef.current && !chatPickerRef.current.contains(event.target)) {
        setShowChatPicker(false);
      }
    };
    if (showChatPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChatPicker]);

  // Close chat message icon pill on outside click
  useEffect(() => {
    if (openMenuIndex === null) return;
    const close = () => { setOpenMenuIndex(null); setOpenMenuPos(null); setPillCopied(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuIndex]);

  const handleSendSticker = async (gif) => {
    setShowChatPicker(false);
    if (!gif?.url) return;
    try {
      const msg = await sendRoomChatSticker(roomId, gif.url, gif.provider || 'giphy', gif.id || '');
      setMessages(prev => {
        const exists = prev.some(m => m.id === msg.id);
        if (exists) return prev;
        const next = [...prev, {
          id: msg.id || Date.now(),
          user_id: currentUser?.id,
          username: currentUser?.username,
          message: '',
          message_type: 'sticker',
          attachment_url: gif.url,
          created_at: msg.created_at || new Date().toISOString(),
        }];
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
      scrollToBottom();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send GIF');
    }
  };

  const handleMentionSelect = (username) => {
    if (mentionStart < 0) return;
    const before = newMessage.slice(0, mentionStart);
    const after = newMessage.slice(chatTextareaRef.current?.selectionStart ?? newMessage.length);
    const inserted = `@${username} `;
    const next = before + inserted + after;
    setNewMessage(next);
    setMentionOpen(false);
    setMentionStart(-1);
    // Restore focus and place cursor after the inserted mention
    setTimeout(() => {
      const el = chatTextareaRef.current;
      if (el) {
        const pos = before.length + inserted.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleEditMessage = async (messageId, newText) => {
    try {
      const response = await editRoomMessage(roomId, messageId, newText);
      // Update the message in state
      setMessages(messages.map(msg => 
        msg.id === messageId ? { ...msg, message: response.message } : msg
      ));
      setEditingMessageId(null);
      setEditText('');
      toast.success('Message updated');
    } catch (err) {
      console.error('Failed to edit message:', err);
      toast.error('Failed to edit message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const response = await deleteRoomMessage(roomId, messageId);
      
      // If deleted by host (soft delete), update message in place
      if (response.deleted_by_host) {
        setMessages(messages.map(msg => 
          msg.id === messageId 
            ? { ...msg, message: '[Message deleted by host]', deleted_by_host: true }
            : msg
        ));
      } else {
        // Owner deleted their own message (hard delete) - remove from state
        setMessages(messages.filter(msg => msg.id !== messageId));
        // Release any Audio element held for this message
        if (audioRefs.current[messageId]) {
          audioRefs.current[messageId].pause();
          delete audioRefs.current[messageId];
        }
      }

      toast.success('Message deleted');
    } catch (err) {
      console.error('Failed to delete message:', err);
      toast.error('Failed to delete message');
    }
  };

  const startEditing = (msg) => {
    setEditingMessageId(msg.id);
    setEditText(msg.message);
    setOpenMenuIndex(null);
  };

  const startReply = (msg) => {
    setReplyingTo(msg);
    setOpenMenuIndex(null);
    document.querySelector('input[placeholder="Message..."]')?.focus();
  };

  const scrollToMessage = (messageId) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 1500);
  };

  const replyCounts = useMemo(() => {
    const counts = {};
    messages.forEach(msg => {
      if (msg.reply_to?.id) {
        counts[msg.reply_to.id] = (counts[msg.reply_to.id] || 0) + 1;
      }
    });
    return counts;
  }, [messages]);

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const saveEdit = (messageId) => {
    if (!editText.trim()) return;
    handleEditMessage(messageId, editText);
  };

  // ✅ Voice Note Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Use webm/opus for Chrome, mp4/mp3 fallback for Safari
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        // Check file size (5MB limit)
        if (audioBlob.size > 5 * 1024 * 1024) {
          toast.error('Voice note too large (max 5MB)');
          stopRecordingCleanup();
          return;
        }
        
        setAudioBlob(audioBlob);
        uploadVoiceNote(audioBlob);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start timer (1 minute max)
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= 60) {
            stopRecording(); // Auto-stop at 1 minute
          }
          return newDuration;
        });
      }, 1000);
      
      toast.success('Recording started');
    } catch (err) {
      console.error('Failed to start recording:', err);
      toast.error('Failed to access microphone');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      
      setIsRecording(false);
    }
  };
  
  const stopRecordingCleanup = () => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
    setAudioBlob(null);
    audioChunksRef.current = [];
  };
  
  const uploadVoiceNote = async (blob) => {
    try {
      const formData = new FormData();
      const fileName = `voice_note_${Date.now()}.webm`;
      formData.append('audio', blob, fileName);
      formData.append('duration', recordingDuration);
      
      await apiClient.post(`/api/rooms/${roomId}/messages/voice-note`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      toast.success('Voice note sent');
      stopRecordingCleanup();
    } catch (err) {
      console.error('Failed to upload voice note:', err);
      toast.error('Failed to send voice note');
      stopRecordingCleanup();
    }
  };
  
  const handleVoiceNoteClick = () => {
    if (!isMember) return;
    
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  // ✅ Audio Playback Controls
  const toggleAudioPlayback = (messageId, audioUrl) => {
    const audio = audioRefs.current[messageId];
    
    if (!audio) {
      // Create new audio element
      const newAudio = new Audio(audioUrl);
      audioRefs.current[messageId] = newAudio;
      
      newAudio.addEventListener('timeupdate', () => {
        const progress = (newAudio.currentTime / newAudio.duration) * 100;
        setAudioProgress(prev => ({ ...prev, [messageId]: progress }));
      });
      
      newAudio.addEventListener('ended', () => {
        setPlayingAudioId(null);
        setAudioProgress(prev => ({ ...prev, [messageId]: 0 }));
      });
      
      newAudio.play();
      setPlayingAudioId(messageId);
    } else {
      if (playingAudioId === messageId) {
        // Pause current audio
        audio.pause();
        setPlayingAudioId(null);
      } else {
        // Stop any other playing audio
        Object.entries(audioRefs.current).forEach(([id, aud]) => {
          if (id !== messageId.toString()) {
            aud.pause();
            aud.currentTime = 0;
          }
        });
        
        // Play this audio
        audio.play();
        setPlayingAudioId(messageId);
      }
    }
  };

  const handleBeginWatch = async () => {
    // If host and there's an existing session, verify it's still valid
    if (activeSession && isHost) {
      // Check if host is actually in the session
      const hostInSession = membersInSession.some(m => m.user_id === currentUser?.id && m.is_active);
      
      if (!hostInSession) {
        // Host is not in session - likely stale. End it before starting new one.
        try {
          await apiClient.post(`/api/rooms/${roomId}/sessions/${activeSession.session_id}/end`);
          toast('Ended inactive session');
          setActiveSession(null);
          setMembersInSession([]);
        } catch (err) {
          console.error('Failed to end stale session:', err);
          // Continue anyway - might already be ended
        }
      }
    }
    setIsWatchTypeModalOpen(true);
  };

  const handleScheduleEvent = () => {
    console.log('🔍 [RoomPageNew] handleScheduleEvent called:', {
      isHost,
      currentUserId: currentUser?.id,
      roomHostId: room?.host_id
    });
    setScheduleModalTab('create');
    setIsScheduleModalOpen(true);
  };

  const handleCreateScheduledEvent = async (eventData) => {
    try {
      const communityReqId = location.state?.schedulePrefill?.community_request_id;
      const payload = communityReqId
        ? { ...eventData, community_request_id: communityReqId }
        : eventData;
      console.log('📅 [RoomPageNew] Creating scheduled event with data:', payload);
      await apiClient.post(`/api/rooms/${roomId}/scheduled-events`, payload);
      toast.success('Event scheduled successfully!');
      await fetchScheduledEvents(); // Refresh events list
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Unknown error';
      const fullError = err.response?.data || err.message;
      
      console.error('❌ Failed to create scheduled event:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        error: errorMessage,
        fullResponse: fullError,
        requestData: eventData,
      });
      
      toast.error(errorMessage);
    }
  };

  // Step 1: Watch Type Selection
  const handleWatchTypeSelected = async (watchType, customConfig) => {
    console.log('✅ Watch type selected:', watchType);
    setSelectedWatchType(watchType);
    setIsWatchTypeModalOpen(false);
    if (watchType === 'custom' && customConfig) {
      // Custom type already has all setup done in the modal — skip info/pricing flow and start directly
      setCustomWatchConfig(customConfig);
      await createWatchSession({
        watch_type: 'custom',
        ticketing_enabled: false,
        content_rating: 'G',
        custom_background_url: customConfig.backgroundUrl,
        screen_region: JSON.stringify(customConfig.region),
      });
    } else {
      setIsWatchTypeInfoModalOpen(true);
    }
  };

  // Step 1.5: Continue from info modal
  const handleWatchTypeInfoContinue = () => {
    setIsWatchTypeInfoModalOpen(false);

    // If classroom, show class type modal
    if (selectedWatchType === 'classroom') {
      setIsClassTypeModalOpen(true);
    } else {
      // Otherwise, go straight to pricing
      setIsPricingModalOpen(true);
    }
  };

  const handleWatchTypeInfoClose = () => {
    setIsWatchTypeInfoModalOpen(false);
    setSelectedWatchType(null);
  };

  // Step 2: Class Type Selection (for classroom watch type)
  const handleClassTypeSelected = (classType) => {
    setSelectedClassType(classType);
    setIsClassTypeModalOpen(false);
    
    // All classroom types should go through pricing and session creation
    setIsPricingModalOpen(true);
  };

  // Step 3: Pricing Selection (Free or Paid)
  const handlePricingSelected = async (pricingType, contentRating) => {
    if (pricingType === 'free') {
      // Create free session immediately with content rating
      setIsPricingModalOpen(false);
      await createWatchSession({
        watch_type: selectedWatchType,
        ticketing_enabled: false,
        content_rating: contentRating || 'G',
      });
    } else if (pricingType === 'paid') {
      // Store content rating for later use with paid session
      setTicketingConfig((prev) => ({ ...prev, content_rating: contentRating || 'G' }));
      // Open ticket price modal
      setIsPricingModalOpen(false);
      setIsSetTicketPriceModalOpen(true);
    }
  };

  // Step 4: Ticket Price Configuration
  const handleTicketPriceSet = async (config) => {
    setTicketingConfig(config);
    setIsSetTicketPriceModalOpen(false);
    
    // Create paid session with ticketing config and content rating
    await createWatchSession({
      watch_type: selectedWatchType,
      ticketing_enabled: true,
      ...config,
      // ✅ Use config.content_rating directly (not stale state)
      content_rating: config.content_rating || 'G',
    });
  };

  // Unified session creation
  const createWatchSession = async (sessionData) => {
    try {
      // Add classType to session data if classroom is selected
      const finalSessionData = {
        ...sessionData,
        ...(selectedWatchType === 'classroom' && selectedClassType && { class_type: selectedClassType })
      };
      
      console.log('🎬 [RoomPageNew] Creating session with data:', finalSessionData);
      console.log('🎬 [RoomPageNew] content_rating:', finalSessionData.content_rating);
      
      const response = await apiClient.post(`/api/rooms/${roomId}/sessions`, finalSessionData);
      const { session_id, watch_type: type } = response.data;

      const sessionTypeLabel = type === '3d_cinema' ? '3D Cinema' : type === 'classroom' ? 'Classroom' : type === 'custom' ? 'Custom Scene' : 'Video Watch';
      const pricingLabel = sessionData.ticketing_enabled 
        ? `(${sessionData.ticket_price_currency}${sessionData.ticket_price_amount})`
        : '(Free)';
      
      toast.success(`Starting ${sessionTypeLabel} ${pricingLabel}...`);

      // Route to appropriate watch page
      if (type === '3d_cinema') {
        navigate(`/cinema-3d-demo/${roomId}?session_id=${session_id}`, {
          state: { 
            isHost: true, 
            sessionId: session_id, 
            currentUser, // ✅ Pass currentUser to avoid async loading
            showLoadingOverlay: true // 🎬 Enable loading overlay for smooth UX
          }
        });
      } else if (type === 'classroom') {
        // Route based on class type (classroom or lecture_hall)
        const classType = finalSessionData.class_type || 'lecture_hall';
        if (classType === 'lecture_hall') {
          navigate(`/classroom/lecture-hall/${roomId}?session_id=${session_id}`, {
            state: { isHost: true, sessionId: session_id, classType: 'lecture_hall' }
          });
        } else {
          // For now, route small classroom to position-calculator too (until ClassroomScene3D is built)
          navigate(`/classroom/classroom/${roomId}?session_id=${session_id}`, {
            state: { isHost: true, sessionId: session_id, classType: 'classroom' }
          });
        }
      } else {
        navigate(`/watch/${roomId}?session_id=${session_id}`, {
          state: { hostId: currentUser.id }
        });
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      toast.error(err.response?.data?.error || 'Failed to start watch session');
    }
  };

  const handleJoinSession = async () => {
    if (!activeSession) return;

    // Verify session is still active before joining
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
      console.log('🔍 [handleJoinSession] Active session response:', {
        session_id: response.data.session_id,
        host_id: response.data.host_id,
        ticketing_enabled: response.data.ticketing_enabled,
        content_rating: response.data.content_rating,
        currentUser: currentUser?.id
      });
      
      if (!response.data.session_id) {
        toast.error('Session has ended');
        setActiveSession(null);
        setMembersInSession([]);
        return;
      }

      const sessionDetails = response.data;
      const isUserHost = (currentUser && currentUser.id === sessionDetails.host_id) || isHost;
      
      // ✅ AGE VERIFICATION (check content rating before allowing join)
      if (!isUserHost && sessionDetails.content_rating) {
        // Check if user has age set (0 = no DOB provided)
        const userAge = currentUser?.age ?? 0;
        if (userAge === 0) {
          console.log('⚠️ [handleJoinSession] User has no age/DOB - prompting');
          setPendingJoinAfterDOB(true);
          setShowDOBModal(true);
          return;
        }
        
        // Check if user can view this content
        if (!canUserViewContent(sessionDetails.content_rating, userAge)) {
          const errorMsg = getAgeRequirementMessage(sessionDetails.content_rating);
          console.log('🔒 [handleJoinSession] Age restriction:', {
            userAge,
            contentRating: sessionDetails.content_rating,
            errorMsg
          });
          toast.error(errorMsg || 'You do not meet the age requirement for this session');
          return;
        }
        
        console.log('✅ [handleJoinSession] Age verification passed:', {
          userAge,
          contentRating: sessionDetails.content_rating
        });
      }
      
      console.log('👑 [handleJoinSession] Host check:', {
        currentUserId: currentUser?.id,
        sessionHostId: sessionDetails.host_id,
        isUserHost,
        isHostFromRoomState: isHost,
        ticketingEnabled: sessionDetails.ticketing_enabled
      });
      
      // ✅ Check if session requires tickets
      if (sessionDetails.ticketing_enabled && !isUserHost) {
        console.log('🎟️ [RoomPageNew] Paid session detected, checking ticket...', {
          sessionId: sessionDetails.session_id,
          ticketPrice: sessionDetails.ticket_price_tokens,
          isUserHost
        });
        
        // Check cache using session_id (not id)
        const sessionIdToCheck = sessionDetails.session_id || sessionDetails.id;
        if (!hasTicketCache(sessionIdToCheck)) {
          console.log('❌ [RoomPageNew] No ticket in cache for session', sessionIdToCheck);
          setIsTicketPurchaseModalOpen(true);
          return;
        }
        
        console.log('✅ [RoomPageNew] Ticket found in cache, allowing join');
      } else if (isUserHost) {
        console.log('👑 [RoomPageNew] User is host, bypassing ticket and age checks');
      } else {
        console.log('ℹ️ [RoomPageNew] Free session or host - no ticket required');
      }
    } catch (err) {
      console.error('Failed to verify session:', err);
      toast.error('Failed to join session');
      return;
    }

    const { session_id, watch_type, class_type } = activeSession;

    // Route to appropriate watch page based on watch_type
    if (watch_type === '3d_cinema') {
      navigate(`/cinema-3d-demo/${roomId}?session_id=${session_id}`, {
        state: { 
          sessionId: session_id, 
          currentUser,
          showLoadingOverlay: true
        }
      });
    } else if (watch_type === 'classroom') {
      // Route based on class_type (classroom = 25 seats, lecture_hall = 145 seats)
      const route = class_type === 'classroom' ? 'classroom' : 'lecture-hall';
      navigate(`/classroom/${route}/${roomId}?session_id=${session_id}`, {
        state: { 
          sessionId: session_id, 
          classType: class_type || 'lecture_hall',
          showLoadingOverlay: true
        }
      });
    } else {
      // Default video watch
      navigate(`/watch/${roomId}?session_id=${session_id}`, {
        state: { hostId: activeSession.host_id }
      });
    }
  };

  // RoomTV handlers
  const handleCreateTVContent = async (contentData) => {
    try {
      const content = await createRoomTVContent(roomId, contentData);
      setHostContent(content);
      toast.success('📺 Content posted to RoomTV!');
    } catch (err) {
      console.error('Failed to create TV content:', err);
      toast.error('Failed to create content');
      throw err; // Re-throw so modal can handle it
    }
  };

  const handleDismissContent = async (contentId) => {
    try {
      await deleteRoomTVContent(roomId, contentId);
      setHostContent(null);
      toast.success('Content dismissed');
    } catch (err) {
      console.error('Failed to dismiss content:', err);
      toast.error('Failed to dismiss content');
    }
  };

  // ✅ Handle ending active session (host only)
  const handleEndSession = async () => {
    console.log('🔴 [RoomPageNew] handleEndSession called');
    console.log('📋 [RoomPageNew] activeSession:', activeSession);
    console.log('👤 [RoomPageNew] isHost:', isHost);
    
    if (!activeSession || !isHost) {
      console.log('⚠️ [RoomPageNew] Aborting: no session or not host');
      return;
    }
    
    const confirmed = window.confirm(
      'End this watch session for everyone? All participants will be returned to the room lobby.'
    );
    
    if (!confirmed) {
      console.log('❌ [RoomPageNew] User cancelled');
      return;
    }
    
    try {
      console.log('📤 [RoomPageNew] Calling end API for session:', activeSession.session_id);
      const response = await endWatchSession(roomId, activeSession.session_id);
      console.log('✅ [RoomPageNew] End API succeeded:', response);
      toast.success('Watch session ended', { id: 'session-ended' });

      // ✅ Check if this was a paid session with earnings (for host)
      if (response?.data?.session && response.data.session.ticketing_enabled && 
          response.data.session.total_ticket_revenue > 0) {
        console.log('💰 [RoomPageNew] Session had earnings - showing earnings modal');
        setSessionEarnings(response.data.session);
        setShowEarningsModal(true);
      }
      
      // ✅ Set flag to prevent re-fetching ended session
      sessionStorage.setItem(`session_ended_${roomId}`, 'true');
      console.log(`🏷️ [RoomPageNew] Set session_ended flag for room ${roomId}`);
      
      setActiveSession(null); // Clear local state
      setMembersInSession([]); // Clear members
      console.log('🧹 [RoomPageNew] Cleared local session state');
    } catch (err) {
      console.error('❌ [RoomPageNew] Failed to end session:', err);
      toast.error(err.response?.data?.error || 'Failed to end session');
    }
  };

  // ✅ Handle joining room
  const handleJoinRoom = async () => {
    if (!currentUser) {
      toast.error('Please log in to join this room');
      return;
    }

    setJoiningRoom(true);
    try {
      await joinRoom(roomId);
      setIsMember(true);
      
      // ✅ Update auth context immediately for instant checks on other pages
      addRoomMembership(Number(roomId));
      
      toast.success('Successfully joined the room! 🎉');
      // Refresh members list for display
      await fetchMembers();
    } catch (err) {
      console.error('Failed to join room:', err);
      toast.error(err.message || 'Failed to join room');
    } finally {
      setJoiningRoom(false);
    }
  };

  // Compress an image file using canvas before upload.
  // GIFs are returned unchanged (compression would strip animation).
  const compressImage = (file) => new Promise((resolve) => {
    if (file.type === 'image/gif') { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_WIDTH = 1920;
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round(height * MAX_WIDTH / width);
        width = MAX_WIDTH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg',
        0.82,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

  // Upload a chat attachment (image or document) to BunnyCDN via the backend.
  const uploadChatAttachment = async (file, type) => {
    let fileToUpload = file;
    if (type === 'image') fileToUpload = await compressImage(file);
    const loadingToast = toast.loading(`Uploading ${type}…`);
    try {
      const msg = await uploadRoomChatAttachment(roomId, fileToUpload, type, selectedGroupId);
      toast.dismiss(loadingToast);
      // Add the new message to local state (WS broadcast also fires but may arrive after)
      setMessages(prev => {
        const exists = prev.some(m => m.id === msg.id);
        if (exists) return prev;
        const next = [...prev, msg];
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error(err?.response?.data?.error || `Failed to upload ${type}`);
    }
  };

  // Hidden file inputs for image and document pickers
  const imagePickerRef = React.useRef(null);
  const documentPickerRef = React.useRef(null);

  // ✅ Handle attachment type selection
  const handleAttachmentTypeSelected = (type) => {
    switch (type) {
      case 'poll':
        setIsCreatePollModalOpen(true);
        break;
      case 'image':
        imagePickerRef.current?.click();
        break;
      case 'document':
        documentPickerRef.current?.click();
        break;
      case 'link':
        toast('Link sharing coming soon!', { icon: '🔗' });
        break;
      default:
        toast.error('Unknown attachment type');
    }
  };

  // ✅ Handle poll creation
  const handleCreatePoll = async (pollData) => {
    try {
      await apiClient.post(`/api/rooms/${roomId}/messages/poll`, {
        question: pollData.question,
        options: pollData.options,
        allow_multiple: pollData.allowMultiple,
      });
      // Poll will be broadcast via WebSocket
    } catch (err) {
      console.error('Failed to create poll:', err);
      throw err; // Let modal handle the error
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading room...</div>
      </div>
    );
  }

  if (error === 'room_not_found' || (!loading && !room && !error)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-black text-white text-center px-8">
        <style>{`
          @keyframes floatZzz {
            0%   { opacity: 0;   transform: translateY(0)    scale(0.7); }
            20%  { opacity: 0.9; }
            80%  { opacity: 0.6; }
            100% { opacity: 0;   transform: translateY(-60px) scale(1.2); }
          }
          .ended-zzz-1 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 0s; }
          .ended-zzz-2 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 0.8s; }
          .ended-zzz-3 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 1.6s; }
        `}</style>
        <div className="relative mb-8 flex items-center justify-center w-28 h-28">
          <img src="/icons/lwoIcon.webp" alt="WatchOut" className="w-20 h-20 opacity-25" />
          <span className="ended-zzz-1 absolute text-white/70 font-bold select-none pointer-events-none" style={{ fontSize: 12, top: 8, right: 8 }}>z</span>
          <span className="ended-zzz-2 absolute text-white/70 font-bold select-none pointer-events-none" style={{ fontSize: 16, top: 0, right: 18 }}>z</span>
          <span className="ended-zzz-3 absolute text-white/70 font-bold select-none pointer-events-none" style={{ fontSize: 22, top: -10, right: 28 }}>Z</span>
        </div>
        <p className="text-xl font-semibold mb-2">Session has ended</p>
        <p className="text-gray-400 text-sm mb-6">This WatchOut session is no longer active.</p>
        <button
          onClick={() => navigate('/lobby')}
          className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-80"
          style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5)' }}
        >
          ← Back to Lobby
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  const membersInRoom = members.length;
  const membersInSessionCount = membersInSession.length;

  return (
    <div className="h-screen flex flex-col bg-violet-50 dark:bg-gray-900 text-gray-900 dark:text-white overflow-hidden relative">
      <Toaster position="top-center" />

      {/* ✅ Recording Watermark - Bottom Right */}
      {isRecording && currentUser && (
        <div className="fixed bottom-4 right-4 text-white/25 text-xs font-mono pointer-events-none z-[9999] select-none">
          {currentUser.username}@LetsWatchOut
        </div>
      )}

      {/* ✅ Sticky Header - Compact layout */}
      <header ref={headerRef} className={`bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700/50 ${isMobile ? 'fixed top-0 left-0 right-0 z-50' : 'flex-none'}`}>
        <div className="py-2 px-0 md:px-3 lg:px-4">
          {isMobile ? (
            /* Mobile Layout */
            <>
              {/* Single Row with nested room name + info */}
              <div className="flex items-center gap-2">
                {/* Back button - isolated at far left */}
                <img
                  src="/icons/backIcon.svg"
                  alt="Back"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/lobby');
                  }}
                  className="h-7 w-7 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0 ml-3 invert dark:invert-0"
                />

                {/* Middle section: Image + Name with info below */}
                <div
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                  onClick={() => setIsEditModalOpen(true)}
                >
                  {/* Room Image */}
                  <div 
                    className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-2 ring-gray-600 flex-shrink-0 cursor-pointer hover:ring-purple-500 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!selectedGroupId && room.image_url) setIsRoomImageExpanded(true);
                    }}
                    title={(!selectedGroupId && room.image_url) ? "Click to view full size" : ""}
                  >
                    {selectedGroupId ? (
                      // Show group image when in group
                      (() => {
                        const selectedGroup = roomGroups.find(g => g.ID === selectedGroupId);
                        return selectedGroup?.icon?.startsWith('http') ? (
                          <img src={selectedGroup.icon} alt={selectedGroup.name} className="w-full h-full object-cover" />
                        ) : selectedGroup?.icon ? (
                          <span className="text-2xl">{selectedGroup.icon}</span>
                        ) : (
                          <span className="text-2xl">💬</span>
                        );
                      })()
                    ) : room.image_url ? (
                      <img src={room.image_url} alt={room.name} className="w-full h-full object-cover" />
                    ) : (
                      <FilmIcon className="w-7 h-7 text-white opacity-80" />
                    )}
                  </div>
                  
                  {/* Room/Group Name + Info Column */}
                  <div className="flex-1 min-w-0">
                    <h1 className={`font-bold text-gray-900 dark:text-white truncate ${
                      (() => {
                        const displayName = selectedGroupId ? (roomGroups.find(g => g.ID === selectedGroupId)?.name || room.name) : room.name;
                        const length = displayName.length;
                        if (length <= 8) return 'text-xl lg:text-2xl';
                        if (length <= 12) return 'text-base lg:text-xl';
                        return 'text-sm lg:text-lg';
                      })()
                    }`}>
                      {selectedGroupId ? (roomGroups.find(g => g.ID === selectedGroupId)?.name || room.name) : room.name}
                    </h1>
                    
                    {/* Host/Member Info below room name (only when no session, hidden on mobile) */}
                    {!activeSession && (
                      <div className="hidden lg:flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-300">
                          {room.show_host !== false && (
                            <span className="flex items-center gap-0.5">
                              <img src="/icons/hostIcon.svg" alt="" className="h-2.5 w-2.5" />
                              <span>(host)</span>
                              <span>{room.host_username || `User ${room.host_id}`}</span>
                            </span>
                          )}
                          <span onClick={() => setIsMembersModalOpen(true)} className="cursor-pointer hover:opacity-80 flex items-center gap-0.5">
                            <img src="/icons/roomMembersIcon.svg" alt="" className="h-2.5 w-2.5" />
                            {membersInRoom}{membersInSessionCount > 0 && `, ${membersInSessionCount} watching`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Right section: Action Icons + Ellipse */}
                <div className="flex items-center gap-2 md:gap-5 flex-shrink-0 ml-auto pr-4 md:pr-6 lg:pr-8" onClick={(e) => e.stopPropagation()}>
                
                {!selectedGroupId && (
                  <>
                    {/* Begin Watch Icon */}
                    {!activeSession && (
                      <img
                        ref={beginWatchRef}
                        src="/icons/beginWatchIcon.svg"
                        alt="Begin Watch"
                        onClick={isHost ? handleBeginWatch : undefined}
                        className={`h-7 w-7 md:h-[38px] md:w-[38px] flex-shrink-0 invert dark:invert-0 ${
                          isHost ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'opacity-30 cursor-not-allowed'
                        }`}
                        title={isHost ? "Begin Watch" : "Only the host can start a watch session"}
                      />
                    )}

                    {/* Schedule Watch Icon */}
                    {!activeSession && (isHost || scheduledEventsCount > 0) && (
                      <div className="relative flex-shrink-0">
                        <img
                          ref={scheduleIconRef}
                          src="/icons/scheduleWatchIcon.svg"
                          alt="Schedule"
                          onClick={() => {
                            setScheduleModalTab(isHost ? 'create' : 'upcoming');
                            setIsScheduleModalOpen(true);
                          }}
                          className="h-[34px] w-[34px] cursor-pointer hover:opacity-80 transition-opacity invert dark:invert-0"
                        />
                        {scheduledEventsCount > 0 && (
                          <div className={`absolute -top-1 -right-1 min-w-[18px] h-5 flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1 shadow-lg ${
                            hasEventStartingSoon ? 'bg-red-500 animate-pulse' : 'bg-purple-500'
                          }`}>
                            {scheduledEventsCount}
                          </div>
                        )}
                      </div>
                    )}

                    {/* RoomTV Icon (Host only) */}
                    {!activeSession && isHost && (
                      <img
                        ref={roomTvIconRef}
                        src="/icons/roomTvIcon.svg"
                        alt="RoomTV"
                        onClick={() => setIsTVContentModalOpen(true)}
                        className="h-[38px] w-[38px] cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                      />
                    )}
                  </>
                )}

                  {/* Pending join requests badge (host only, private rooms) */}
                  {isHost && pendingJoinCount > 0 && (
                    <button
                      onClick={() => setIsJoinRequestsModalOpen(true)}
                      className="relative flex items-center justify-center w-8 h-8 rounded-full bg-orange-500 hover:bg-orange-400 transition-colors flex-shrink-0"
                      title="Pending join requests"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {pendingJoinCount > 9 ? '9+' : pendingJoinCount}
                      </span>
                    </button>
                  )}

                </div>
              </div>
            </>
          ) : (
            /* Desktop Layout */
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Back Icon - Desktop */}
                  <img 
                    src="/icons/backIcon.svg" 
                    alt="Back" 
                    onClick={() => navigate('/lobby')}
                    className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0 invert dark:invert-0"
                  />
                  
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-2 ring-gray-600 flex-shrink-0">
                    {selectedGroupId ? (
                      // Show group image when in group
                      (() => {
                        const selectedGroup = roomGroups.find(g => g.ID === selectedGroupId);
                        return selectedGroup?.icon?.startsWith('http') ? (
                          <img src={selectedGroup.icon} alt={selectedGroup.name} className="w-full h-full object-cover" />
                        ) : selectedGroup?.icon ? (
                          <span className="text-2xl">{selectedGroup.icon}</span>
                        ) : (
                          <span className="text-2xl">💬</span>
                        );
                      })()
                    ) : room.image_url ? (
                      <img src={getAssetUrl(room.image_url)} alt={room.name} className="w-full h-full object-cover" />
                    ) : (
                      <FilmIcon className="w-6 h-6 text-white opacity-80" />
                    )}
                  </div>
                  
                  {/* Room/Group Name + Info Column */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {selectedGroupId ? roomGroups.find(g => g.ID === selectedGroupId)?.name || room.name : room.name}
                      </h1>
                      {wsConnected && (
                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" title="Connected" />
                      )}
                    </div>
                    
                    {/* Host/Member Info below name (only when no session) */}
                    {!activeSession && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                          {!selectedGroupId && room.show_host !== false && (
                            <span className="flex items-center gap-1">
                              <img src="/icons/hostIcon.svg" alt="" className="h-4 w-4 brightness-0 dark:brightness-100" />
                              Host: {room.host_username || `User ${room.host_id}`}
                            </span>
                          )}
                          <span 
                            className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setIsMembersModalOpen(true)}
                            title="View members"
                          >
                            <img src="/icons/roomMembersIcon.svg" alt="" className="h-4 w-4 brightness-0 dark:brightness-100" />
                            {selectedGroupId ? (
                              `${roomGroups.find(g => g.ID === selectedGroupId)?.member_count || 0} in group`
                            ) : (
                              `${membersInRoom} in room${membersInSessionCount > 0 ? `, ${membersInSessionCount} watching` : ''}`
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-6 pr-6 lg:pr-10">
                  {!selectedGroupId && (
                    <>
                      {!activeSession && (
                        <>
                          {/* Begin Watch Button - Host: clickable, Members: greyed out */}
                          {isHost ? (
                            <img
                              ref={beginWatchRef}
                              src="/icons/beginWatchIcon.svg"
                              alt="Begin Watch"
                              onClick={handleBeginWatch}
                              className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity invert dark:invert-0"
                              title="Begin Watch"
                            />
                          ) : (
                            <img
                              src="/icons/beginWatchIcon.svg"
                              alt="Begin Watch"
                              className="h-10 w-10 opacity-30 cursor-not-allowed invert dark:invert-0"
                              title="Only the host can start a watch session"
                            />
                          )}
                        </>
                      )}
                      {/* Schedule icon: Always visible to host, visible to members only if events exist */}
                      {(isHost || scheduledEventsCount > 0) && (
                        <div className="relative">
                          <img
                            ref={scheduleIconRef}
                            src="/icons/scheduleWatchIcon.svg"
                            alt="Schedule Watch"
                            onClick={() => {
                              setScheduleModalTab(isHost ? 'create' : 'upcoming');
                              setIsScheduleModalOpen(true);
                            }}
                            className="h-11 w-11 cursor-pointer hover:opacity-80 transition-opacity invert dark:invert-0"
                            title={isHost ? "Schedule Watch" : "View Scheduled Events"}
                          />
                          {/* Badge with event count */}
                          {scheduledEventsCount > 0 && (
                            <div
                              className={`absolute top-0 right-0 min-w-[24px] h-6 flex items-center justify-center rounded-full text-white text-xs font-bold px-2 shadow-lg ${
                                hasEventStartingSoon
                                  ? 'bg-red-500 animate-pulse'
                                  : 'bg-purple-500'
                              }`}
                              title={`${scheduledEventsCount} scheduled event${scheduledEventsCount !== 1 ? 's' : ''}`}
                            >
                              {scheduledEventsCount}
                            </div>
                          )}
                        </div>
                      )}
                      {isHost && (
                        <img
                          ref={roomTvIconRef}
                          src="/icons/roomTvIcon.svg"
                          alt="Post to RoomTV"
                          onClick={() => setIsTVContentModalOpen(true)}
                          className="h-11 w-11 cursor-pointer hover:opacity-80 transition-opacity"
                          title="Post to RoomTV"
                        />
                      )}
                    </>
                  )}
                  
                  <EllipsisVerticalIcon
                    onClick={() => setIsEditModalOpen(true)}
                    className="hidden lg:block h-8 w-8 text-gray-900 dark:text-white cursor-pointer hover:opacity-80 transition-opacity"
                    title="Room Settings"
                  />
                </div>
              </div>

              {/* Room Description - Desktop only */}
              {(room.show_description === true || room.ShowDescription === true) && room.description && room.description.trim() !== '' && (
                <div className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-3xl">
                  {room.description}
                </div>
              )}
            </>
          )}
        </div>

        {/* ✅ RoomTV - Seamlessly below header info */}
        <RoomTV
          roomId={roomId}
          activeSession={activeSession}
          upcomingEvents={upcomingEvents}
          hostContent={hostContent}
          onJoinSession={handleJoinSession}
          onEndSession={handleEndSession}
          isHost={isHost}
          isSuperAdmin={currentUser?.role === 'super_admin'}
          onDismissContent={handleDismissContent}
          refetchTrigger={roomTVRefetchTrigger}
        />
      </header>

      {/* ✅ Main content area: Sidebar + Chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* ✅ Left Sidebar - Room Groups (Discord-style channels) */}
        <RoomPageLeftSidebar
          room={room}
          groups={roomGroups}
          selectedGroupId={selectedGroupId}
          onGroupSelect={handleGroupSelect}
          onDeleteGroup={handleDeleteGroupFromSidebar}
          onGroupEdit={handleGroupEdit}
          isHost={isHost}
          mobileHeaderHeight={mobileHeaderHeight}
        />

        {/* Chat column: messages + input */}
        <div className="flex-1 flex flex-col min-h-0">

        {/* ✅ Chat Messages - Fills remaining space */}
        <div
          ref={messagesContainerRef}
          className={`flex-1 overflow-y-auto bg-violet-50 dark:bg-gray-900 px-4 space-y-1.5 scrollbar-hide relative ${
            isMobile ? '' : 'py-2'
          }`}
          style={isMobile ? { paddingTop: `${mobileHeaderHeight + 8}px`, paddingBottom: '110px' } : undefined}
        >
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <FilmIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-base">No messages yet</p>
            <p className="text-xs mt-1 opacity-75">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwnMessage = msg.user_id === currentUser?.id;
            const isEditing = editingMessageId === msg.id;
            const messageAge = Date.now() - new Date(msg.created_at).getTime();
            const canEdit = isOwnMessage && !msg.deleted_by_host && messageAge < 5 * 60 * 1000; // 5 minutes
            const canDelete = isOwnMessage || isHost;
            const isPoll = msg.message_type === 'poll';

            // Poll messages have special rendering
            if (isPoll && msg.poll_data) {
              return (
                <div
                  key={index}
                  data-message-index={index}
                  className="flex justify-center"
                >
                  <PollMessage
                    poll={{
                      id: msg.id,
                      question: msg.poll_data.question,
                      options: msg.poll_data.options,
                      allow_multiple: msg.poll_data.allow_multiple,
                      votes: msg.poll_data.votes || [],
                      is_closed: msg.poll_data.is_closed || false,
                      created_by_username: msg.username || 'Anonymous',
                      created_at: msg.created_at,
                    }}
                    currentUserId={currentUser?.id}
                    roomId={roomId}
                  />
                </div>
              );
            }

            const isSwiping = swipingMsgIndex === index;
            const currentSwipeX = isSwiping ? swipeX : 0;
            const isHighlighted = highlightedMessageId === msg.id;
            const replyCount = replyCounts[msg.id] || 0;

            return (
              <div
                key={index}
                data-message-index={index}
                data-message-id={msg.id}
                className={`flex group relative ${isOwnMessage ? 'justify-end' : 'justify-start'} transition-colors duration-700 rounded-lg ${
                  isHighlighted ? 'bg-purple-500/20' : ''
                }`}
                style={{ touchAction: 'pan-y' }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  e.currentTarget.dataset.touchStartX = touch.clientX;
                  e.currentTarget.dataset.touchStartY = touch.clientY;
                  e.currentTarget.dataset.swipeLocked = 'false';
                  setSwipingMsgIndex(index);
                  setSwipeX(0);
                }}
                onTouchMove={(e) => {
                  const touch = e.touches[0];
                  const startX = parseFloat(e.currentTarget.dataset.touchStartX);
                  const startY = parseFloat(e.currentTarget.dataset.touchStartY);
                  const deltaX = touch.clientX - startX;
                  const deltaY = touch.clientY - startY;
                  if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
                    e.preventDefault();
                    e.currentTarget.dataset.swipeLocked = 'true';
                    const clamped = Math.min(deltaX, 90);
                    setSwipeX(clamped);
                  }
                }}
                onTouchEnd={(e) => {
                  const startX = parseFloat(e.currentTarget.dataset.touchStartX);
                  const deltaX = e.changedTouches[0].clientX - startX;
                  if (deltaX > 60 && e.currentTarget.dataset.swipeLocked === 'true') startReply(msg);
                  setSwipingMsgIndex(null);
                  setSwipeX(0);
                }}
              >
                {/* Swipe reply indicator — slides in from left */}
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-purple-500 text-white transition-all duration-100 pointer-events-none"
                  style={{
                    opacity: currentSwipeX > 20 ? Math.min((currentSwipeX - 20) / 50, 1) : 0,
                    transform: `translateY(-50%) translateX(${Math.min(currentSwipeX * 0.6, 40)}px) scale(${0.6 + Math.min(currentSwipeX / 90, 1) * 0.4})`,
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </div>

                <div
                  className="relative max-w-xs"
                  style={{ transform: `translateX(${currentSwipeX * 0.35}px)`, transition: isSwiping ? 'none' : 'transform 0.2s ease-out' }}
                >
                  {/* Quoted / replied-to preview */}
                  {msg.reply_to && (
                    <div
                      className={`mb-0.5 cursor-pointer rounded-lg overflow-hidden ${isOwnMessage ? 'ml-auto' : ''}`}
                      style={{ maxWidth: '100%' }}
                      onClick={() => msg.reply_to.id && scrollToMessage(msg.reply_to.id)}
                    >
                      <div className={`flex items-stretch rounded-lg overflow-hidden border ${
                        isOwnMessage
                          ? 'bg-blue-900/50 border-blue-700/40'
                          : 'bg-violet-100/70 dark:bg-gray-700/60 border-violet-200/60 dark:border-gray-600/40'
                      }`}>
                        {/* Colored left accent bar */}
                        <div className={`w-1 flex-shrink-0 ${isOwnMessage ? 'bg-blue-400' : 'bg-purple-400'}`} />
                        <div className="px-2.5 py-1.5 min-w-0">
                          <div className={`text-[11px] font-semibold mb-0.5 ${isOwnMessage ? 'text-blue-300' : 'text-purple-300'}`}>
                            {msg.reply_to.username}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-300 truncate leading-snug">
                            {msg.reply_to.message}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Main message bubble — tap to reveal icon pill */}
                  <div
                    className={`relative px-3 py-1.5 rounded-lg shadow-sm cursor-pointer select-none ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : 'bg-violet-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                    } ${openMenuIndex === index ? 'opacity-90 scale-[0.98]' : ''} transition-all duration-100`}
                    onClick={(e) => {
                      if (isEditing) return;
                      e.stopPropagation();
                      if (openMenuIndex === index) {
                        setOpenMenuIndex(null);
                        setOpenMenuPos(null);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      const showBelow = rect.top < 80;
                      setOpenMenuIndex(index);
                      setOpenMenuPos({
                        top: showBelow ? rect.bottom + 6 : rect.top - 50,
                        left: rect.left + rect.width / 2,
                        isOwn: isOwnMessage,
                      });
                    }}
                  >
                    {/* Icon pill floats above/below this bubble — rendered at fixed level */}
                    {/* Username and Time — only for text messages */}
                    {!msg.audio_url && (
                      <div className="flex items-center justify-between gap-3 text-xs opacity-75 mb-1">
                        <span className="font-medium">{msg.username || 'Anonymous'}</span>
                        <span className="text-[10px]">
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      </div>
                    )}

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full px-2 py-1 bg-violet-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-violet-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={cancelEditing} className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded">Cancel</button>
                          <button onClick={() => saveEdit(msg.id)} className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded">Save</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.audio_url ? (
                          <div className="w-full">
                            <div className="flex items-center justify-between gap-3 text-xs opacity-75 mb-2">
                              <span className="font-medium">{msg.username || 'Anonymous'}</span>
                              <span className="text-[10px]">
                                {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleAudioPlayback(msg.id, msg.audio_url)}
                                className="flex-shrink-0 w-6 h-6 hover:opacity-70 transition-opacity flex items-center justify-center"
                              >
                                {playingAudioId === msg.id ? (
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z" /></svg>
                                ) : (
                                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                                )}
                              </button>
                              <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden max-w-[140px]">
                                <div className="h-full bg-white transition-all duration-100" style={{ width: `${audioProgress[msg.id] || 0}%` }} />
                              </div>
                              {msg.duration > 0 && (
                                <span className="text-xs opacity-60 flex-shrink-0 min-w-[32px] text-right">
                                  {Math.floor(msg.duration / 60)}:{String(msg.duration % 60).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : msg.message_type === 'image' && msg.attachment_url ? (
                          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.attachment_url}
                              alt={msg.attachment_name || 'Image'}
                              className="max-w-[220px] rounded-lg object-cover"
                              onLoad={() => scrollToBottom && scrollToBottom()}
                            />
                          </a>
                        ) : msg.message_type === 'document' && msg.attachment_url ? (
                          <a
                            href={msg.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm underline opacity-90 hover:opacity-100"
                          >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="truncate max-w-[180px]">{msg.attachment_name || 'Document'}</span>
                          </a>
                        ) : msg.message_type === 'sticker' && msg.attachment_url ? (
                          <img
                            src={msg.attachment_url}
                            alt="GIF"
                            className="max-w-[180px] rounded-lg"
                            onLoad={() => scrollToBottom && scrollToBottom()}
                          />
                        ) : (
                          <ChatMessageText
                            text={msg.message}
                            className={msg.deleted_by_host ? 'italic opacity-75 text-sm' : 'text-sm'}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Reply count badge */}
                  {replyCount > 0 && !isEditing && (
                    <div className={`mt-0.5 flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                      <button
                        onClick={() => startReply(msg)}
                        className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                      </button>
                    </div>
                  )}

                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />

        {/* Scroll to Bottom Button — purple to contrast with blue message bubbles */}
        {(showScrollButton || hasMention) && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 right-8 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-all duration-200 z-30"
            title={hasMention ? `You were mentioned` : unreadCount > 0 ? `${unreadCount} new message${unreadCount !== 1 ? 's' : ''}` : 'Scroll to latest message'}
          >
            <div className="relative flex items-center gap-2 px-4 py-3">
              {/* @mention badge — amber, takes priority over unread count */}
              {hasMention && (
                <div className="absolute -top-2 -right-2 min-w-[22px] h-[22px] flex items-center justify-center bg-amber-400 rounded-full text-gray-900 text-xs font-bold px-1 shadow-lg">
                  @
                </div>
              )}
              {/* Unread count badge — only when no mention */}
              {!hasMention && unreadCount > 0 && (
                <div className="absolute -top-2 -right-2 min-w-[24px] h-6 flex items-center justify-center bg-red-500 rounded-full text-white text-xs font-bold px-2 shadow-lg animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
              <img src="/icons/bottomIcon.svg" alt="Scroll to bottom" className="h-6 w-6" />
              {hasMention && (
                <span className="text-sm font-medium whitespace-nowrap">mentioned you</span>
              )}
              {!hasMention && unreadCount > 0 && (
                <span className="text-sm font-medium whitespace-nowrap">{unreadCount} new</span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* ✅ Message Input - Fixed bottom on mobile */}
      {isMember && (
        <>
          {/* Chat Locked Banner (for non-host members) */}
          {room?.host_only_chat && !isHost && (
            <div className={`border-t border-yellow-500/30 fixed bottom-[52px] right-0 z-[39] bg-white dark:bg-gray-900 lg:static lg:bg-yellow-500/10 dark:lg:bg-yellow-500/10 lg:z-auto ${roomGroups.length > 0 ? 'left-16 sm:left-20 md:left-24' : 'left-0'} px-3 py-2`}>
              <div className="flex items-center gap-2 text-xs text-yellow-300">
                <span className="text-base">🔒</span>
                <span>Chat is locked by the host. Only the host can send messages.</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSendMessage} className={`fixed bottom-0 right-0 z-40 lg:relative lg:z-auto lg:left-0 ${roomGroups.length > 0 ? 'left-16 sm:left-20 md:left-24' : 'left-0'} px-4 pb-0 pt-0`}>

            {/* @mention dropdown */}
            {mentionOpen && (
              <MentionDropdown
                members={members}
                query={mentionQuery}
                onSelect={handleMentionSelect}
                onClose={() => setMentionOpen(false)}
              />
            )}

            {/* Reply Banner */}
            {replyingTo && (
              <div className="flex items-stretch mb-1.5 rounded-lg overflow-hidden bg-violet-100/80 dark:bg-gray-700/80 border border-purple-400/40 dark:border-purple-500/40">
                <div className="w-1 flex-shrink-0 bg-purple-500" />
                <div className="flex items-center flex-1 min-w-0 px-3 py-2 gap-2">
                  <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-purple-300">@{replyingTo.username}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-300 truncate leading-snug">{replyingTo.message}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Input Card */}
            <div className="rounded-2xl bg-white dark:bg-gray-700 border border-violet-200 dark:border-gray-600 shadow-lg overflow-visible">

              {/* Text area or recording indicator */}
              {isRecording ? (
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                  <span className="font-mono text-sm text-red-400">
                    {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-gray-400">Recording voice note…</span>
                </div>
              ) : (
                <textarea
                  ref={chatTextareaRef}
                  value={newMessage}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewMessage(val);
                    // @mention detection: scan backwards from cursor for @word
                    const cursor = e.target.selectionStart;
                    const textBefore = val.slice(0, cursor);
                    const match = textBefore.match(/@(\w*)$/);
                    if (match) {
                      setMentionQuery(match[1]);
                      setMentionStart(cursor - match[0].length);
                      setMentionOpen(true);
                    } else {
                      setMentionOpen(false);
                      setMentionStart(-1);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (mentionOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab')) {
                      e.preventDefault();
                      return;
                    }
                    if (e.key === 'Escape' && mentionOpen) {
                      setMentionOpen(false);
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder={room?.host_only_chat && !isHost ? "Chat is locked (host-only)" : "Message…"}
                  disabled={!isMember || (room?.host_only_chat && !isHost)}
                  rows={1}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 pt-2.5 pb-1 text-sm"
                  style={{ minHeight: '36px', maxHeight: '96px' }}
                />
              )}

              {/* Divider */}
              <div className="border-t border-gray-300 dark:border-gray-600 mx-3" />

              {/* Action row */}
              <div className="flex items-center justify-between px-2 py-1">
                {/* Left: action icons */}
                <div className="flex items-center gap-0.5">

                  {/* Voice note */}
                  <button
                    type="button"
                    onClick={handleVoiceNoteClick}
                    disabled={!isMember || (room?.host_only_chat && !isHost)}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isRecording
                        ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20'
                        : 'text-gray-400 hover:text-purple-400 hover:bg-purple-900/20'
                    }`}
                    title={isRecording ? `Stop recording (${recordingDuration}s)` : "Voice note"}
                  >
                    {isRecording
                      ? <StopCircleIcon className="h-5 w-5" />
                      : <MicrophoneOutlineIcon className="h-5 w-5" />
                    }
                  </button>

                  {/* Emoji / Stickers / GIFs — unified picker */}
                  <div className="relative" ref={chatPickerRef}>
                    <button
                      type="button"
                      onClick={() => isMember && !(room?.host_only_chat && !isHost) && setShowChatPicker(p => !p)}
                      disabled={!isMember || (room?.host_only_chat && !isHost)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-purple-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Emoji / Stickers / GIFs"
                    >
                      <FaceSmileOutlineIcon className="h-5 w-5" />
                    </button>
                    {showChatPicker && isMember && (
                      <div className="absolute bottom-full left-0 mb-2 z-50">
                        <StickerPicker
                          onEmojiSelect={(emoji) => { handleEmojiClick(emoji); setShowChatPicker(false); }}
                          onStickerSelect={handleSendSticker}
                        />
                      </div>
                    )}
                  </div>

                  {/* Attach */}
                  <button
                    type="button"
                    onClick={() => isMember && setIsAttachModalOpen(true)}
                    disabled={!isMember}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-purple-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Attach image / video / file"
                  >
                    <PaperClipOutlineIcon className="h-5 w-5" />
                  </button>

                  {/* Poll */}
                  <button
                    type="button"
                    onClick={() => isMember && !(room?.host_only_chat && !isHost) && setIsCreatePollModalOpen(true)}
                    disabled={!isMember || (room?.host_only_chat && !isHost)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-purple-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Create poll"
                  >
                    <ChartBarSquareOutlineIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Send button */}
                <button
                  type="submit"
                  disabled={(!newMessage.trim() && !isRecording) || !isMember || (room?.host_only_chat && !isHost)}
                  className="w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-md flex-shrink-0"
                  title="Send"
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </>
      )}

      {/* ✅ Join Room Button - Replaces input area when not a member */}
      {!isMember && !isHost && currentUser && (
        <div className={`bg-violet-50 dark:bg-gray-800 border-t border-violet-200 dark:border-gray-700/50 ${
          isMobile ? `fixed bottom-0 ${roomGroups.length > 0 ? 'left-16 sm:left-20 md:left-24 lg:left-28' : 'left-0'} right-0 z-40 px-2 py-2 shadow-lg` : 'flex-none px-4 py-3'
        }`}>
          <button
            onClick={handleJoinRoom}
            disabled={joiningRoom}
            className={`w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${
              isMobile ? 'py-2 text-sm' : 'py-3 text-base'
            }`}
          >
            {joiningRoom ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Joining...</span>
              </>
            ) : (
              <>
                <UserIcon className="h-5 w-5" />
                <span>Join Room to Chat & Watch</span>
              </>
            )}
          </button>
        </div>
      )}

        </div> {/* closes chat column */}
      </div> {/* closes flex flex-1 overflow-hidden row */}

      {/* ✅ Watch Type Modal */}
      <WatchTypeModal
        isOpen={isWatchTypeModalOpen}
        onClose={() => setIsWatchTypeModalOpen(false)}
        onSelectType={handleWatchTypeSelected}
        title="Choose Your Watch Experience"
      />

      {/* ✅ Watch Type Info Modal */}
      <WatchTypeInfoModal
        isOpen={isWatchTypeInfoModalOpen}
        onClose={handleWatchTypeInfoClose}
        onContinue={handleWatchTypeInfoContinue}
        watchType={selectedWatchType}
      />

      {/* ✅ Class Type Modal (for Classroom) */}
      <ClassTypeModal
        isOpen={isClassTypeModalOpen}
        onClose={() => {
          setIsClassTypeModalOpen(false);
          setIsWatchTypeModalOpen(true); // Return to watch type selection
        }}
        onSelectClassType={handleClassTypeSelected}
        currentUser={currentUser}
      />

      {/* ✅ Pricing Modal (Free or Paid) */}
      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => {
          setIsPricingModalOpen(false);
          setIsWatchTypeModalOpen(true); // Return to watch type selection
        }}
        onSelectPricing={handlePricingSelected}
        watchType={selectedWatchType}
      />

      {/* ✅ Set Ticket Price Modal */}
      <SetTicketPriceModal
        isOpen={isSetTicketPriceModalOpen}
        onClose={() => {
          setIsSetTicketPriceModalOpen(false);
          setIsPricingModalOpen(true); // Return to pricing selection
        }}
        onSetPrice={handleTicketPriceSet}
        watchType={selectedWatchType}
      />

      {/* ✅ Ticket Purchase Modal */}
      <TicketPurchaseModal
        isOpen={isTicketPurchaseModalOpen}
        onClose={() => {
          setIsTicketPurchaseModalOpen(false);
        }}
        session={activeSession ? {
          id: activeSession.id,  // ✅ Use numeric DB ID for API calls
          session_id: activeSession.session_id,  // Keep UUID for reference
          title: activeSession.session_title,
          host_name: activeSession.host_name,
          watch_type: activeSession.watch_type,
          class_type: activeSession.class_type,  // ✅ Added class_type for lecture hall detection
          started_at: activeSession.started_at,
          ticket_price_tokens: activeSession.ticket_price_tokens,
          ticket_price_currency: activeSession.ticket_price_currency,
          ticket_price_amount: activeSession.ticket_price_amount,
          early_bird_enabled: activeSession.early_bird_enabled,
          early_bird_price_tokens: activeSession.early_bird_price_tokens,
          early_bird_active: activeSession.early_bird_active,
        } : null}
        onSuccess={(sessionId) => {
          console.log('✅ [RoomPageNew] Ticket purchase successful, navigating...');
          setIsTicketPurchaseModalOpen(false);
          
          // Navigate based on watch_type
          const { session_id, watch_type, class_type } = activeSession;
          
          if (watch_type === '3d_cinema') {
            navigate(`/cinema-3d-demo/${roomId}?session_id=${session_id}`, {
              state: { 
                sessionId: session_id, 
                currentUser,
                showLoadingOverlay: true
              }
            });
          } else if (watch_type === 'classroom') {
            const route = class_type === 'classroom' ? 'classroom' : 'lecture-hall';
            navigate(`/classroom/${route}/${roomId}?session_id=${session_id}`, {
              state: { sessionId: session_id, classType: class_type || 'lecture_hall' }
            });
          } else {
            navigate(`/watch/${roomId}?session_id=${session_id}`, {
              state: { hostId: activeSession.host_id }
            });
          }
        }}
      />

      {/* ✅ Schedule Event Modal */}
      <ScheduleEventModal
        isOpen={isScheduleModalOpen}
        roomId={roomId}
        roomType={room?.room_type}
        onClose={() => {
          setIsScheduleModalOpen(false);
          fetchScheduledEvents(); // Refresh count when modal closes
        }}
        onCreate={handleCreateScheduledEvent}
        isHost={isHost}
        activeTab={scheduleModalTab}
        prefill={location.state?.schedulePrefill || null}
      />

      {/* ✅ Room Edit Modal */}
      {isRoomImageExpanded && room?.image_url && (
        <div 
          className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4"
          onClick={() => setIsRoomImageExpanded(false)}
        >
          <div className="relative">
            <button 
              onClick={() => setIsRoomImageExpanded(false)}
              className="absolute -top-8 sm:-top-12 right-0 text-white hover:text-gray-300 text-2xl sm:text-3xl leading-none"
            >
              ×
            </button>
            <img 
              src={getAssetUrl(room.image_url)} 
              alt={room.name}
              className="max-w-[90vw] sm:max-w-[600px] max-h-[80vh] sm:max-h-[600px] w-auto h-auto object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      <RoomPageEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        room={{ ...room, average_watchers: hostAverageWatchers }}
        onUpdate={(updatedRoom) => {
          setRoom(updatedRoom);
          toast.success('Room updated successfully');
        }}
        onShare={() => setIsShareModalOpen(true)}
        isHost={isHost}
        membersInRoom={membersInRoom}
        members={members}
      />

      {/* ✅ Room Group Edit Modal */}
      <RoomGroupEditModal
        isOpen={isGroupEditModalOpen}
        onClose={() => {
          setIsGroupEditModalOpen(false);
          setSelectedGroup(null);
        }}
        group={selectedGroup}
        roomId={roomId}
        isHost={isHost}
        currentUserId={currentUser?.id}
        onUpdate={handleGroupUpdate}
        onDelete={handleGroupDelete}
        isMember={isUserGroupMember}
        onJoin={handleGroupJoin}
        onLeave={handleGroupLeave}
      />

      {/* One-time coach-mark tour for hosts visiting their own room */}
      {showRoomTour && (
        <Coachmark
          steps={[
            { ref: beginWatchRef, title: 'Begin Watch', description: 'Start a watch session here — your room comes alive the moment you press this.' },
            { ref: scheduleIconRef, title: 'Schedule Event', description: 'Plan a watch party, class, or service ahead of time so members know when to show up.' },
            { ref: roomTvIconRef, title: 'RoomTV', description: 'Share important updates, clips, and posts with everyone in your room.' },
          ]}
          onComplete={() => {
            setShowRoomTour(false);
            localStorage.setItem('wewatch_room_tour_seen', '1');
          }}
        />
      )}

      {/* Room Join Requests Modal (host only, private rooms) */}
      {isHost && (
        <RoomJoinRequestsModal
          isOpen={isJoinRequestsModalOpen}
          onClose={() => setIsJoinRequestsModalOpen(false)}
          roomId={roomId}
          onCountChange={setPendingJoinCount}
        />
      )}

      {/* ✅ Room Members Modal */}
      <RoomMembersModal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        members={members}
        onAddMembers={() => {
          setIsMembersModalOpen(false);
          setIsShareModalOpen(true);
        }}
        onRequestReopen={() => setIsMembersModalOpen(true)}
        isHost={isHost}
        roomId={roomId}
        onMemberKicked={(userId) => {
          setMembers(prev => prev.filter(m => (m.id || m.user_id) !== userId));
        }}
      />

      {/* ✅ Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomId}
        roomName={room?.name || room?.Name}
      />

      {/* ✅ Create TV Content Modal (Host Only) */}
      <CreateTVContentModal
        isOpen={isTVContentModalOpen}
        onClose={() => setIsTVContentModalOpen(false)}
        onSubmit={handleCreateTVContent}
        activeSessionId={activeSession?.session_id || null}
        roomId={roomId}
      />

      {/* ✅ Room Attach Modal */}
      <RoomAttachModal
        isOpen={isAttachModalOpen}
        onClose={() => setIsAttachModalOpen(false)}
        onSelectType={handleAttachmentTypeSelected}
      />

      {/* Hidden file pickers for chat attachments */}
      <input
        ref={imagePickerRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) uploadChatAttachment(file, 'image');
          e.target.value = '';
        }}
      />
      <input
        ref={documentPickerRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) uploadChatAttachment(file, 'document');
          e.target.value = '';
        }}
      />

      {/* ✅ Create Poll Modal */}
      <CreatePollModal
        isOpen={isCreatePollModalOpen}
        onClose={() => setIsCreatePollModalOpen(false)}
        onSubmit={handleCreatePoll}
      />

      {/* ✅ Session Earnings Modal - Shows host earnings after ending paid sessions */}
      {sessionEarnings && (
        <SessionEarningsModal
          isOpen={showEarningsModal}
          onClose={() => {
            setShowEarningsModal(false);
            setSessionEarnings(null);
          }}
          sessionData={sessionEarnings}
          contentRating={room?.content_rating}
        />
      )}

      {/* ✅ Session Rating Modal - Shows after paid sessions end */}
      {sessionToRate && (
        <SessionRatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            setSessionToRate(null);
          }}
          sessionId={sessionToRate.sessionId}
          hostName={sessionToRate.hostName}
          sessionTitle={sessionToRate.sessionTitle}
          onSubmit={async ({ rating, review }) => {
            try {
              // ✅ Submit rating to backend API
              await apiClient.post(`/api/sessions/${sessionToRate.sessionId}/ratings`, {
                rating,
                review: review.trim() || undefined, // Only send review if not empty
              });
              
              toast.success('Thanks for your feedback! 🌟');
              
              // Close modal and clear state
              setShowRatingModal(false);
              setSessionToRate(null);
            } catch (error) {
              console.error('Failed to submit rating:', error);
              
              // Handle specific error cases
              if (error.response?.status === 409) {
                toast.error('You have already rated this session');
              } else if (error.response?.status === 403) {
                toast.error('You must have attended this session to rate it');
              } else {
                toast.error('Failed to submit rating. Please try again.');
              }
              
              throw error; // Re-throw so modal shows error state
            }
          }}
        />
      )}
      
      {/* ✅ Date of Birth Modal - Required for age-restricted content */}
      <DateOfBirthPromptModal
        isOpen={showDOBModal}
        onSubmit={handleDOBSubmit}
        isSubmitting={dobSubmitting}
      />

      {/* ✅ Chat message icon pill — fixed so it escapes overflow-y-auto clipping */}
      {openMenuIndex !== null && openMenuPos && (() => {
        const msg = messages[openMenuIndex];
        if (!msg) return null;
        const isOwnMsg = msg.user_id === currentUser?.id;
        const msgAge = Date.now() - new Date(msg.created_at).getTime();
        const canEditMsg = isOwnMsg && !msg.deleted_by_host && msgAge < 5 * 60 * 1000;
        const canDeleteMsg = isOwnMsg || isHost;
        return (
          <div
            className="fixed z-[500] flex items-center gap-0.5 bg-gray-900 rounded-full px-1.5 py-1 shadow-2xl border border-gray-700/60 animate-[fadeScaleIn_0.15s_ease-out]"
            style={{ top: openMenuPos.top, left: openMenuPos.left, transform: 'translateX(-50%)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Copy */}
            {!msg.audio_url && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(msg.content || msg.message || '');
                  setPillCopied(true);
                  setTimeout(() => { setPillCopied(false); setOpenMenuIndex(null); setOpenMenuPos(null); }, 1200);
                }}
                title="Copy"
                className="p-1.5 text-white hover:text-green-300 active:scale-90 transition-all"
              >
                {pillCopied
                  ? <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd"/></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                }
              </button>
            )}
            {/* Edit — own + within 5 min */}
            {canEditMsg && (
              <button
                onClick={() => { startEditing(msg); setOpenMenuIndex(null); setOpenMenuPos(null); }}
                title="Edit"
                className="p-1.5 text-white hover:text-blue-300 active:scale-90 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
            )}
            {/* Delete */}
            {canDeleteMsg && (
              <button
                onClick={() => { handleDeleteMessage(msg.id); setOpenMenuIndex(null); setOpenMenuPos(null); }}
                title="Delete"
                className="p-1.5 text-white hover:text-red-400 active:scale-90 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            )}
            {/* Reply */}
            <button
              onClick={() => { startReply(msg); setOpenMenuIndex(null); setOpenMenuPos(null); }}
              title="Reply"
              className="p-1.5 text-white hover:text-purple-300 active:scale-90 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
              </svg>
            </button>
          </div>
        );
      })()}
    </div>
  );
};

export default RoomPageNew;
