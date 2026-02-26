// WeWatch/frontend/src/components/RoomPageNew.jsx
// Redesigned RoomPage - Hub for room with persistent chat (no video player)
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import EmojiPicker from 'emoji-picker-react';
import logger from '../utils/logger';
import { hasTicketCache } from '../utils/ticketCache';
import {
  ArrowLeftIcon,
  UserIcon,
  ClockIcon,
  FilmIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useMobile } from '../hooks/useMobile';
import apiClient, { editRoomMessage, deleteRoomMessage, getRoomTVContent, createRoomTVContent, deleteRoomTVContent, joinRoom, endWatchSession } from '../services/api';
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
// TODO: Review MediaBanner integration later - currently commented out for future use
// import MediaBanner from './MediaBanner';

const RoomPageNew = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { currentUser, roomMemberships, addRoomMembership, removeRoomMembership } = useAuth();
  const isMobile = useMobile();

  // Room state
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [openMenuIndex, setOpenMenuIndex] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastVisibleMessageIndexRef = useRef(null); // Track last visible message when scrolling away

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
  const [isTVContentModalOpen, setIsTVContentModalOpen] = useState(false);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [isCreatePollModalOpen, setIsCreatePollModalOpen] = useState(false);
  
  // Session rating state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionToRate, setSessionToRate] = useState(null);
  
  // Ticketing flow state
  const [selectedWatchType, setSelectedWatchType] = useState(null);
  const [selectedClassType, setSelectedClassType] = useState(null);
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

  // Track activeSession state changes
  useEffect(() => {
    console.log('🔄 [Session State]', {
      hasSession: !!activeSession,
      sessionId: activeSession?.session_id || activeSession?.id || 'none',
      watchType: activeSession?.watch_type || 'none',
      memberCount: activeSession?.members?.length || 0
    });
  }, [activeSession]);

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
          setNotifiedEvents(prev => new Set([...prev, notificationKey]));
          
          // Show in-app toast notification
          toast(`📅 Event "${event.title}" starts in ${minutesUntilEvent} minute${minutesUntilEvent > 1 ? 's' : ''}!`, {
            duration: 10000,
            icon: '⏰',
          });
          
          // Show browser notification if permission granted
          if (notificationPermission === 'granted') {
            new Notification('WeWatch - Scheduled Event', {
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
            new Notification('WeWatch - Event Starting!', {
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
    // Mark component as mounted
    isMountedRef.current = true;
    
    fetchRoomData();
    fetchActiveSession();
    fetchMembers();
    fetchRoomMessages();
    fetchTVContent();
    fetchScheduledEvents();
    connectWebSocket(); // Connect immediately - room WebSocket is for chat, not session

    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      fetchActiveSession();
      fetchMembers();
      fetchTVContent();
    }, 10000);

    return () => {
      console.log(`🧹 [RoomPageNew] Component cleanup initiated for room ${roomId}`);
      
      // Mark component as unmounted
      isMountedRef.current = false;
      console.log('🛑 [RoomPageNew] Component marked as unmounted');
      
      clearInterval(interval);
      console.log('⏱️ [RoomPageNew] Polling interval cleared');
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        console.log('🧹 [RoomPageNew] Clearing reconnect timeout');
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Close WebSocket properly
      wsConnectedRef.current = false;
      if (wsRef.current) {
        console.log('🔌 [RoomPageNew] Closing WebSocket connection', {
          readyState: wsRef.current.readyState,
          url: wsRef.current.url?.split('?')[0]
        });
        wsRef.current.close();
        wsRef.current = null;
        console.log('✅ [RoomPageNew] WebSocket closed and cleared');
      } else {
        console.log('ℹ️ [RoomPageNew] No active WebSocket to close');
      }
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
      setLoading(true);
      const response = await apiClient.get(`/api/rooms/${roomId}`);
      const roomData = response.data.room;
      setRoom(roomData);
      const userIsHost = currentUser?.id === roomData.host_id;
      setIsHost(userIsHost);
      
      console.log('🔍 [RoomPageNew] fetchRoomData - Host check:');
      console.log('  currentUser.id:', currentUser?.id, 'type:', typeof currentUser?.id);
      console.log('  roomData.host_id:', roomData.host_id, 'type:', typeof roomData.host_id);
      console.log('  userIsHost:', userIsHost);
      
      // ✅ Host is always considered a member
      if (userIsHost) {
        console.log('  Setting isMember=true for host');
        setIsMember(true);
      }
    } catch (err) {
      console.error('Failed to fetch room:', err);
      setError('Failed to load room data');
      toast.error('Failed to load room');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveSession = async () => {
    // ✅ ALWAYS check for pending rating (even if no session_ended flag)
    console.log('🔍 [RoomPageNew] Checking for pending rating...');
    const pendingRating = sessionStorage.getItem(`pending_rating_${roomId}`);
    if (pendingRating) {
      try {
        const ratingData = JSON.parse(pendingRating);
        console.log('⭐ [RoomPageNew] Found pending rating - showing modal:', ratingData);
        setSessionToRate(ratingData);
        setShowRatingModal(true);
        sessionStorage.removeItem(`pending_rating_${roomId}`);
      } catch (error) {
        console.error('❌ [RoomPageNew] Failed to parse pending rating:', error);
        sessionStorage.removeItem(`pending_rating_${roomId}`);
      }
    } else {
      console.log('ℹ️ [RoomPageNew] No pending rating found');
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
      console.log(`🔍 [RoomPageNew] Fetching active session for room ${roomId}`);
      
      const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
      
      // Backend returns session data at root level
      if (response.data.session_id) {
        console.log('✅ [RoomPageNew] Active session found:', {
          sessionId: response.data.session_id,
          watchType: response.data.watch_type,
          memberCount: response.data.members?.length || 0,
          startedAt: response.data.started_at
        });
        
        // ✅ Validate session age - reject sessions older than 4 hours
        const sessionStartTime = new Date(response.data.started_at);
        const sessionAge = (Date.now() - sessionStartTime.getTime()) / (1000 * 60 * 60); // hours
        
        if (sessionAge > 4) {
          console.warn(`⚠️ Session ${response.data.session_id} is ${sessionAge.toFixed(1)} hours old - clearing stale session`);
          
          // Try to end the stale session on the backend
          try {
            await apiClient.post(`/api/rooms/${roomId}/sessions/${response.data.session_id}/end`);
            toast('Cleared stale session', { icon: '🧹' });
          } catch (endError) {
            console.error('Failed to end stale session:', endError);
          }
          
          console.log('🧹 [RoomPageNew] Setting activeSession to null (stale session)');
          setActiveSession(null);
          setMembersInSession([]);
        } else {
          console.log('📌 [RoomPageNew] Setting activeSession state with valid session data');
          console.log('🔍 [DEBUG] response.data structure:', response.data);
          console.log('🔍 [DEBUG] Calling setActiveSession with:', response.data);
          setActiveSession(response.data);
          console.log('✅ [DEBUG] setActiveSession called successfully');
          setMembersInSession(response.data.members || []);
        }
      } else {
        console.log('ℹ️ [RoomPageNew] No active session found - setting to null');
        setActiveSession(null);
        setMembersInSession([]);
      }
    } catch (err) {
      // No active session is not an error
      console.log('ℹ️ [RoomPageNew] fetchActiveSession error (likely no session) - setting to null');
      setActiveSession(null);
      setMembersInSession([]);
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
        console.log('🔍 [RoomPageNew] fetchMembers - Validating membership:');
        console.log('  currentUser.id:', currentUser.id, 'type:', typeof currentUser.id);
        console.log('  isHost:', isHost);
        console.log('  membersList:', membersList.map(m => ({ id: m.id, type: typeof m.id, username: m.username })));
        
        const userIsMember = membersList.some(member => member.id === currentUser.id);
        console.log('  userIsMember result:', userIsMember);
        
        // ✅ Only update if different from current state (avoids unnecessary re-renders)
        setIsMember(prev => {
          if (prev !== userIsMember) {
            console.log('  📝 Updating isMember from', prev, 'to', userIsMember);
            return userIsMember;
          }
          console.log('  ✓ isMember already correct:', prev);
          return prev;
        });
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  };

  const fetchRoomMessages = async () => {
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/messages`);
      const msgs = response.data.messages || [];
      // console.log('📨 Fetched messages:', msgs);
      // console.log('📨 First message structure:', msgs[0]);
      setMessages(msgs);
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
        console.log('✅ [RoomPageNew] Successfully prevented zombie reconnection');
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
      console.log('⏱️ [RoomPageNew] Scheduling reconnect in 5 seconds...');
      reconnectTimeoutRef.current = setTimeout(() => {
        // Double-check component is still mounted before reconnecting
        if (isMountedRef.current) {
          console.log('🔄 [RoomPageNew] Reconnect timeout fired - attempting to reconnect WebSocket...');
          console.log('📊 [RoomPageNew] Pre-reconnect state:', {
            componentMounted: isMountedRef.current,
            wsConnected: wsConnectedRef.current,
            hasWsRef: !!wsRef.current
          });
          connectWebSocket();
        } else {
          console.log('🛑 [RoomPageNew] Component unmounted during reconnect wait - aborting reconnection');
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
      logger.debug(`📬 [RoomPageNew] Handling message type: ${message.type}`);
      
      switch (message.type) {
        case 'room_chat':
          setMessages(prev => [...prev, message.data]);
          
          // Check if user is scrolled up - if so, increment unread count
          if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
            
            if (!isAtBottom) {
              // User is scrolled up, increment unread count
              setUnreadCount(prev => prev + 1);
            } else {
              // User is at bottom, auto-scroll
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
        case 'session_ended':
          logger.debug('🛑 [RoomPageNew] SESSION_ENDED message received:', {
            reason: message.data?.reason,
            sessionId: message.data?.session_id,
            currentActiveSession: activeSession?.id || 'none',
            timestamp: new Date().toISOString()
          });
          
          const reason = message.data?.reason;
          if (reason === 'host_timeout') {
            toast('Watch session ended - Host disconnected', { icon: '⏰' });
          } else {
            toast('Watch session ended');
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
    setUnreadCount(0); // Reset unread count when scrolling to bottom
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

    try {
      await apiClient.post(`/api/rooms/${roomId}/messages`, {
        message: newMessage,
      });
      setNewMessage('');
      setShowEmojiPicker(false); // Close picker after sending
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    }
  };

  const handleEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

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
      await apiClient.post(`/api/rooms/${roomId}/scheduled-events`, eventData);
      toast.success('Event scheduled successfully!');
      await fetchScheduledEvents(); // Refresh events list
    } catch (err) {
      console.error('Failed to create scheduled event:', err);
      toast.error('Failed to schedule event');
    }
  };

  // Step 1: Watch Type Selection
  const handleWatchTypeSelected = async (watchType) => {
    console.log('✅ Watch type selected:', watchType);
    setSelectedWatchType(watchType);
    setIsWatchTypeModalOpen(false);
    setIsWatchTypeInfoModalOpen(true);
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
  const handlePricingSelected = async (pricingType) => {
    if (pricingType === 'free') {
      // Create free session immediately
      setIsPricingModalOpen(false);
      await createWatchSession({
        watch_type: selectedWatchType,
        ticketing_enabled: false,
      });
    } else if (pricingType === 'paid') {
      // Open ticket price modal
      setIsPricingModalOpen(false);
      setIsSetTicketPriceModalOpen(true);
    }
  };

  // Step 4: Ticket Price Configuration
  const handleTicketPriceSet = async (config) => {
    setTicketingConfig(config);
    setIsSetTicketPriceModalOpen(false);
    
    // Create paid session with ticketing config
    await createWatchSession({
      watch_type: selectedWatchType,
      ticketing_enabled: true,
      ...config,
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
      
      const response = await apiClient.post(`/api/rooms/${roomId}/sessions`, finalSessionData);
      const { session_id, watch_type: type } = response.data;

      const sessionTypeLabel = type === '3d_cinema' ? '3D Cinema' : type === 'classroom' ? 'Classroom' : 'Video Watch';
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
          navigate(`/position-calculator/classroom?room_id=${roomId}&session_id=${session_id}`, {
            state: { isHost: true, sessionId: session_id, classType: 'lecture_hall' }
          });
        } else {
          // For now, route small classroom to position-calculator too (until ClassroomScene3D is built)
          navigate(`/position-calculator/classroom?room_id=${roomId}&session_id=${session_id}`, {
            state: { isHost: true, sessionId: session_id, classType: 'classroom' }
          });
        }
      } else {
        navigate(`/watch/${roomId}?session_id=${session_id}`);
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
        currentUser: currentUser?.id
      });
      
      if (!response.data.session_id) {
        toast.error('Session has ended');
        setActiveSession(null);
        setMembersInSession([]);
        return;
      }

      // ✅ Check if session requires tickets
      const sessionDetails = response.data;
      // ✅ Use isHost state as fallback if currentUser not loaded yet
      const isUserHost = (currentUser && currentUser.id === sessionDetails.host_id) || isHost;
      
      console.log('👑 [handleJoinSession] Host check:', {
        currentUserId: currentUser?.id,
        sessionHostId: sessionDetails.host_id,
        isUserHost,
        isHostFromRoomState: isHost,
        ticketingEnabled: sessionDetails.ticketing_enabled
      });
      
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
        console.log('👑 [RoomPageNew] User is host, bypassing ticket check');
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
      navigate(`/position-calculator/${route}?room_id=${roomId}&session_id=${session_id}`, {
        state: { 
          sessionId: session_id, 
          classType: class_type || 'lecture_hall',
          showLoadingOverlay: true
        }
      });
    } else {
      // Default video watch
      navigate(`/watch/${roomId}?session_id=${session_id}`);
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
      await endWatchSession(roomId, activeSession.session_id);
      console.log('✅ [RoomPageNew] End API succeeded');
      toast.success('Watch session ended');
      
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

  // ✅ Handle attachment type selection
  const handleAttachmentTypeSelected = (type) => {
    switch (type) {
      case 'poll':
        setIsCreatePollModalOpen(true);
        break;
      case 'image':
        // TODO: Implement image upload
        toast('Image upload coming soon!', { icon: '📸' });
        break;
      case 'document':
        // TODO: Implement document upload
        toast('Document upload coming soon!', { icon: '📄' });
        break;
      case 'link':
        // TODO: Implement link sharing
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

  if (error || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">{error || 'Room not found'}</div>
      </div>
    );
  }

  const membersInRoom = members.length;
  const membersInSessionCount = membersInSession.length;

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">
      <Toaster position="top-center" />

      {/* ✅ Sticky Header - Compact layout */}
      <header className={`bg-gray-800 ${isMobile ? 'fixed top-0 left-0 right-0 z-50' : 'flex-none'}`}>
        <div className={`px-4 ${isMobile ? 'py-2' : 'py-0'}`}>
          {isMobile ? (
            /* Mobile Layout */
            <>
              {/* Single Row with nested room name + info */}
              <div className="flex items-start justify-between gap-1">
                {/* Left section: Back + Image + Name with info below */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Back button - same level as image and name */}
                  <img 
                    src="/icons/backIcon.svg" 
                    alt="Back" 
                    onClick={() => navigate('/lobby')}
                    className="h-5 w-5 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                  />
                  
                  {/* Room Image */}
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-2 ring-gray-600 flex-shrink-0">
                    {room.image_url ? (
                      <img src={room.image_url} alt={room.name} className="w-full h-full object-cover" />
                    ) : (
                      <FilmIcon className="w-7 h-7 text-white opacity-80" />
                    )}
                  </div>
                  
                  {/* Room Name + Host/Member Info Column */}
                  <div className="flex-1 min-w-0">
                    <h1 className={`font-bold text-white truncate ${
                      (() => {
                        const length = room.name.length;
                        if (length <= 8) return 'text-2xl';
                        if (length <= 12) return 'text-xl';
                        return 'text-lg';
                      })()
                    }`}>
                      {room.name}
                    </h1>
                    
                    {/* Host/Member Info below room name (only when no session) */}
                    {!activeSession && (
                      <div className="flex items-center gap-2 text-[10px] text-gray-300 mt-0.5">
                        {room.show_host !== false && (
                          <span className="flex items-center gap-0.5">
                            <img src="/icons/hostIcon.svg" alt="" className="h-2.5 w-2.5" />
                            Host: {room.host_username || `User ${room.host_id}`}
                          </span>
                        )}
                        <span onClick={() => setIsMembersModalOpen(true)} className="cursor-pointer hover:opacity-80 flex items-center gap-0.5">
                          <img src="/icons/roomMembersIcon.svg" alt="" className="h-2.5 w-2.5" />
                          {membersInRoom} in room{membersInSessionCount > 0 && `, ${membersInSessionCount} watching`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Right section: Action Icons + Ellipse */}
                <div className="flex items-center gap-1 flex-shrink-0">
                
                {/* Begin Watch Icon */}
                {!activeSession && (
                  <img 
                    src="/icons/beginWatchIcon.svg"
                    alt="Begin Watch"
                    onClick={isHost ? handleBeginWatch : undefined}
                    className={`h-12 w-12 flex-shrink-0 ${
                      isHost ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'opacity-30 cursor-not-allowed'
                    }`}
                    title={isHost ? "Begin Watch" : "Only the host can start a watch session"}
                  />
                )}
                
                {/* Schedule Watch Icon */}
                {!activeSession && (isHost || scheduledEventsCount > 0) && (
                  <div className="relative flex-shrink-0">
                    <img 
                      src="/icons/scheduleWatchIcon.svg" 
                      alt="Schedule" 
                      onClick={() => {
                        setScheduleModalTab(isHost ? 'create' : 'upcoming');
                        setIsScheduleModalOpen(true);
                      }}
                      className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity"
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
                    src="/icons/roomTvIcon.svg" 
                    alt="RoomTV" 
                    onClick={() => setIsTVContentModalOpen(true)}
                    className="h-11 w-11 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                  />
                )}
                
                  {/* Ellipse */}
                  <EllipsisVerticalIcon 
                    onClick={() => setIsEditModalOpen(true)}
                    className="h-6 w-6 text-white cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                  />
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
                    className="h-6 w-6 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                  />
                  
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-2 ring-gray-600 flex-shrink-0">
                    {room.image_url ? (
                      <img src={room.image_url} alt={room.name} className="w-full h-full object-cover" />
                    ) : (
                      <FilmIcon className="w-6 h-6 text-white opacity-80" />
                    )}
                  </div>
                  
                  {/* Room Name + Host/Member Info Column */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-bold text-white">{room.name}</h1>
                      {wsConnected && (
                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" title="Connected" />
                      )}
                    </div>
                    
                    {/* Host/Member Info below room name (only when no session) */}
                    {!activeSession && (
                      <div className="flex items-center gap-4 text-sm text-gray-300 mt-1">
                        {room.show_host !== false && (
                          <span className="flex items-center gap-1">
                            <img src="/icons/hostIcon.svg" alt="" className="h-4 w-4" />
                            Host: {room.host_username || `User ${room.host_id}`}
                          </span>
                        )}
                        <span 
                          className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setIsMembersModalOpen(true)}
                          title="View members"
                        >
                          <img src="/icons/roomMembersIcon.svg" alt="" className="h-4 w-4" />
                          {membersInRoom} in room
                          {membersInSessionCount > 0 && `, ${membersInSessionCount} watching`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {!activeSession && (
                    <>
                      {/* Begin Watch Button - Host: clickable, Members: greyed out */}
                      {isHost ? (
                        <img 
                          src="/icons/beginWatchIcon.svg"
                          alt="Begin Watch"
                          onClick={handleBeginWatch}
                          className="h-20 w-20 cursor-pointer hover:opacity-80 transition-opacity"
                          title="Begin Watch"
                        />
                      ) : (
                        <img 
                          src="/icons/beginWatchIcon.svg"
                          alt="Begin Watch"
                          className="h-20 w-20 opacity-30 cursor-not-allowed"
                          title="Only the host can start a watch session"
                        />
                      )}
                    </>
                  )}
                  {/* Schedule icon: Always visible to host, visible to members only if events exist */}
                  {(isHost || scheduledEventsCount > 0) && (
                    <div className="relative">
                      <img 
                        src="/icons/scheduleWatchIcon.svg" 
                        alt="Schedule Watch" 
                        onClick={() => {
                          // Host opens to 'create' tab, members open to 'upcoming' tab
                          setScheduleModalTab(isHost ? 'create' : 'upcoming');
                          setIsScheduleModalOpen(true);
                        }}
                        className="h-20 w-20 cursor-pointer hover:opacity-80 transition-opacity"
                        title={isHost ? "Schedule Watch" : "View Scheduled Events"}
                      />
                      {/* Badge with event count */}
                      {scheduledEventsCount > 0 && (
                        <div 
                          className={`absolute top-1 right-1 min-w-[24px] h-6 flex items-center justify-center rounded-full text-white text-xs font-bold px-2 shadow-lg ${
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
                      src="/icons/roomTvIcon.svg" 
                      alt="Post to RoomTV" 
                      onClick={() => setIsTVContentModalOpen(true)}
                      className="h-24 w-24 cursor-pointer hover:opacity-80 transition-opacity -mt-2"
                      title="Post to RoomTV"
                    />
                  )}
                  
                  <EllipsisVerticalIcon 
                    onClick={() => setIsEditModalOpen(true)}
                    className="h-8 w-8 text-white cursor-pointer hover:opacity-80 transition-opacity"
                    title="Room Settings"
                  />
                </div>
              </div>

              {/* Room Description - Desktop only */}
              {room.show_description && room.description && (
                <div className="mt-1 text-sm text-gray-300">
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
          onDismissContent={handleDismissContent}
        />
      </header>

      {/* ✅ Chat Messages - Fills remaining space */}
      <div 
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto bg-gray-900 px-4 space-y-1.5 scrollbar-hide relative ${
          isMobile ? 'pt-[240px] pb-[70px]' : 'py-2'
        }`}
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
            const canEdit = isOwnMessage && messageAge < 2 * 60 * 1000; // 2 minutes
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

            return (
              <div
                key={index}
                data-message-index={index}
                className={`flex group ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div className="relative">
                  <div
                    className={`max-w-xs px-3 py-1.5 rounded-lg shadow-sm ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                    }`}
                  >
                    {/* Username and Time on same line - only for text messages */}
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
                          className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={cancelEditing}
                            className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(msg.id)}
                            className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Voice Note Player */}
                        {msg.audio_url ? (
                          <div className="w-full">
                            {/* Row 1: Sender & Timestamp */}
                            <div className="flex items-center justify-between gap-3 text-xs opacity-75 mb-2">
                              <span className="font-medium">{msg.username || 'Anonymous'}</span>
                              <span className="text-[10px]">
                                {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            </div>
                            
                            {/* Row 2: Play Button & Progress Bar */}
                            <div className="flex items-center gap-2">
                              {/* Play/Pause Button */}
                              <button
                                onClick={() => toggleAudioPlayback(msg.id, msg.audio_url)}
                                className="flex-shrink-0 w-6 h-6 hover:opacity-70 transition-opacity flex items-center justify-center"
                              >
                                {playingAudioId === msg.id ? (
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                  </svg>
                                )}
                              </button>
                              
                              {/* Progress Bar */}
                              <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden max-w-[140px]">
                                <div 
                                  className="h-full bg-white transition-all duration-100"
                                  style={{ width: `${audioProgress[msg.id] || 0}%` }}
                                />
                              </div>
                              
                              {/* Duration - only show if > 0 */}
                              {msg.duration > 0 && (
                                <span className="text-xs opacity-60 flex-shrink-0 min-w-[32px] text-right">
                                  {Math.floor(msg.duration / 60)}:{String(msg.duration % 60).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Text Message */
                          <div className={msg.deleted_by_host ? 'italic opacity-75 text-sm' : 'text-sm'}>
                            {msg.message}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* 3-dot menu - Shows on hover for own messages or host */}
                  {!isEditing && !msg.deleted_by_host && (canEdit || canDelete) && (
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setOpenMenuIndex(openMenuIndex === index ? null : index)}
                        className="p-1 hover:bg-gray-700 rounded-full bg-gray-800 bg-opacity-50"
                      >
                        <EllipsisVerticalIcon className="w-5 h-5 text-gray-300" />
                      </button>

                      {openMenuIndex === index && (
                        <div className="absolute right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 min-w-[120px] z-10">
                          {canEdit && (
                            <button
                              onClick={() => startEditing(msg)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                handleDeleteMessage(msg.id);
                                setOpenMenuIndex(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />

        {/* ✅ Scroll to Bottom Button with Unread Counter */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 right-8 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-200 z-30 group"
            title={unreadCount > 0 ? `${unreadCount} new message${unreadCount !== 1 ? 's' : ''}` : "Scroll to latest message"}
          >
            <div className="relative flex items-center gap-2 px-4 py-3">
              {/* Badge with unread count */}
              {unreadCount > 0 && (
                <div className="absolute -top-2 -right-2 min-w-[24px] h-6 flex items-center justify-center bg-red-500 rounded-full text-white text-xs font-bold px-2 shadow-lg animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
              
              {/* Icon and Text */}
              <img src="/icons/bottomIcon.svg" alt="Scroll to bottom" className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {unreadCount} new
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* ✅ Message Input - Fixed bottom on mobile */}
      {isMember && (
        <form onSubmit={handleSendMessage} className={`bg-gray-800 ${
          isMobile ? 'fixed bottom-0 left-0 right-0 z-40' : 'flex-none'
        } px-2 py-2 sm:px-4 sm:py-3 shadow-lg`}>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Attach Button - Standalone left */}
          <button
            type="button"
            onClick={() => isMember && setIsAttachModalOpen(true)}
            disabled={!isMember}
            className="p-0 hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            title={isMember ? "Attach files, images, or create poll" : "Join room to attach content"}
          >
            <img src="/icons/roomAttachIcon.svg" alt="Attach" className="h-5 w-5 sm:h-8 sm:w-8" />
          </button>

          {/* ✅ Message Box Container - Contains emoji, input, and voice (when not recording) */}
          <div className="relative flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded-lg">
            {/* Emoji Button - Absolute positioned left inside box */}
            <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10" ref={emojiPickerRef}>
              <button
                type="button"
                onClick={() => isMember && setShowEmojiPicker(!showEmojiPicker)}
                disabled={!isMember}
                className="p-0 hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                title={isMember ? "Emojis & Stickers" : "Join room to use emojis"}
              >
                <img src="/icons/stickerIcon.svg" alt="Emojis & Stickers" className="h-5 w-5 sm:h-8 sm:w-8" />
              </button>
              
              {/* Emoji Picker Popup */}
              {showEmojiPicker && isMember && (
                <div className="absolute bottom-full left-0 mb-2 z-50">
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme="dark"
                    width={280}
                    height={400}
                    searchPlaceholder="Search emoji..."
                    categories={[
                      { name: 'Smileys & People', category: 'smileys_people' },
                      { name: 'Animals & Nature', category: 'animals_nature' },
                      { name: 'Food & Drink', category: 'food_drink' },
                      { name: 'Travel & Places', category: 'travel_places' },
                      { name: 'Activities', category: 'activities' },
                      { name: 'Objects', category: 'objects' },
                      { name: 'Symbols', category: 'symbols' },
                      { name: 'Flags', category: 'flags' },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* Message Input - Centered with padding to avoid icons */}
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message..."
              disabled={!isMember}
              className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-white placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed pl-9 pr-9 py-1.5 text-sm sm:pl-12 sm:pr-12 sm:py-2.5"
            />

            {/* Voice Note Button - Absolute positioned right inside box (only when NOT recording) */}
            {!isRecording && (
              <button
                type="button"
                onClick={handleVoiceNoteClick}
                disabled={!isMember}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0 hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                title={isMember ? "Record Voice Note" : "Join room to send voice notes"}
              >
                <img 
                  src="/icons/mic.svg" 
                  alt="Voice Note" 
                  className="h-5 w-5 sm:h-8 sm:w-8"
                />
              </button>
            )}
          </div>

          {/* Recording State - Voice button moves outside with timer */}
          {isRecording && (
            <>
              <div className="flex items-center gap-1 text-red-500 font-mono text-[10px] sm:text-xs animate-pulse flex-shrink-0">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
              </div>
              <button
                type="button"
                onClick={handleVoiceNoteClick}
                disabled={!isMember}
                className="p-0 hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed relative flex-shrink-0 animate-pulse"
                title="Stop Recording"
              >
                <img 
                  src="/icons/mic.svg" 
                  alt="Voice Note" 
                  className="h-5 w-5 sm:h-8 sm:w-8 filter brightness-150"
                />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              </button>
            </>
          )}

          {/* Send Button - Standalone right */}
          <img 
            src="/icons/sendIcon.svg" 
            alt="Send" 
            onClick={isMember ? handleSendMessage : undefined}
            className={`transition-opacity flex-shrink-0 h-10 w-10 sm:h-20 sm:w-20 ${
              isMember ? 'cursor-pointer hover:opacity-80' : 'opacity-40 cursor-not-allowed'
            }`}
            title={isMember ? "Send message" : "Join room to send messages"}
          />
        </div>
        </form>
      )}

      {/* ✅ Join Room Button - Replaces input area when not a member */}
      {!isMember && !isHost && currentUser && (
        <div className={`bg-gray-800 ${
          isMobile ? 'fixed bottom-0 left-0 right-0 z-40 px-2 py-2 shadow-lg' : 'flex-none px-4 py-3'
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
            navigate(`/position-calculator/${route}?room_id=${roomId}&session_id=${session_id}`, {
              state: { sessionId: session_id, classType: class_type || 'lecture_hall' }
            });
          } else {
            navigate(`/watch/${roomId}?session_id=${session_id}`);
          }
        }}
      />

      {/* ✅ Schedule Event Modal */}
      <ScheduleEventModal
        isOpen={isScheduleModalOpen}
        roomId={roomId}
        onClose={() => {
          setIsScheduleModalOpen(false);
          fetchScheduledEvents(); // Refresh count when modal closes
        }}
        onCreate={handleCreateScheduledEvent}
        isHost={isHost}
        activeTab={scheduleModalTab}
      />

      {/* ✅ Room Edit Modal */}
      <RoomPageEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        room={room}
        onUpdate={(updatedRoom) => {
          setRoom(updatedRoom);
          toast.success('Room updated successfully');
        }}
        onShare={() => setIsShareModalOpen(true)}
        isHost={isHost}
      />

      {/* ✅ Room Members Modal */}
      <RoomMembersModal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        members={members}
        onAddMembers={() => {
          setIsMembersModalOpen(false);
          setIsShareModalOpen(true);
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

      {/* ✅ Create Poll Modal */}
      <CreatePollModal
        isOpen={isCreatePollModalOpen}
        onClose={() => setIsCreatePollModalOpen(false)}
        onSubmit={handleCreatePoll}
      />

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
    </div>
  );
};

export default RoomPageNew;
