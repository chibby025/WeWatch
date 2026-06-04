// src/components/cinema/VideoWatch.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import AppSplash from '../AppSplash';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';
import useWebSocket from '../../hooks/useWebSocket';
import { getTemporaryMediaItemsForRoom, deleteSingleTemporaryMediaItem, getChatHistory, API_BASE_URL } from '../../services/api';
import apiClient from '../../services/api';
import { getRoom, getRoomMembers, getActiveSession } from '../../services/api';
import { hasTicketCache, clearTicketCache } from '../../utils/ticketCache';

// Prefix relative backend paths (e.g. /uploads/temp/...) with the Go server origin
// so the browser fetches them from localhost:8080, not the Vite dev server.
// Only prefix backend-served paths (/uploads/). Leave /icons/ and other
// Vite public assets alone — the backend doesn't serve those.
// DB stores paths without a leading slash ("uploads/temp/x.mp4") so we
// normalise before checking — both forms are handled correctly.
const toAbsUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const withSlash = url.startsWith('/') ? url : `/${url}`;
  if (withSlash.startsWith('/uploads/')) return `${API_BASE_URL}${withSlash}`;
  return url;
};
// ✅ Import LiveKit hook + events
import useLiveKitRoom from '../../hooks/useLiveKitRoom';
import { Track, ParticipantEvent, RoomEvent } from 'livekit-client';
// UI Components
import SeatsModal from './ui/SeatsModal';
import LeftSidebar from './ui/LeftSidebar';
import VideoSidebar from './ui/VideoSidebar';
import SeatSwapNotification from './ui/SeatSwapNotification';
import Taskbar from '../Taskbar';
import CinemaVideoPlayer from './ui/CinemaVideoPlayer';
import CameraPreview from './ui/CameraPreview';
import CameraSidebar from './ui/CameraSidebar';
import VideoTiles from './ui/VideoTiles';
import CinemaSeatView from './ui/CinemaSeatView';
import ScrollableSeatGrid from './ui/ScrollableSeatGrid';
import LiveShareBreakOverlay from './ui/LiveShareBreakOverlay';
import ShareModal from '../ShareModal';
import MembersModal from '../../components/MembersModal.jsx';
import RemoteAudioPlayer from './ui/RemoteAudioPlayer';
import FloatingGiftIcon from '../FloatingGiftIcon';
import DonationNotification from '../DonationNotification';
// Import sounds
import { playSeatSound, playMicOnSound, playMicOffSound } from '../../utils/audio';
import ChatHomeModal from '../ChatHomeModal.jsx';
import PrivateChatModal from '../PrivateChatModal.jsx';
// Quiz system modals
import QuizManagementModal from './modals/QuizManagementModal';
import MakeQuizModal from './modals/MakeQuizModal';
import TakeQuizModal from './modals/TakeQuizModal';
import QuizResultsModal from './modals/QuizResultsModal';
// Game system components
import GameLobbyModal from '../Games/GameLobbyModal';
import GameOverlay from '../Games/GameOverlay';
// Graphics renderer for LiveShare overlays
import { GraphicsRenderer } from '../../utils/GraphicsRenderer';
import BibleOverlay from '../liveshare/BibleOverlay';
import HymnOverlay from '../liveshare/HymnOverlay';
import SermonOverlay from '../liveshare/SermonOverlay';
import TikTokHeartAnimation from '../TikTokHeartAnimation';
import { HeartIcon } from '@heroicons/react/24/solid';
import useEmoteSounds from '../../hooks/useEmoteSounds';
import useNetworkQuality from '../../hooks/useNetworkQuality';
import FloatingEmoteOverlay from './ui/FloatingEmoteOverlay';
import NetworkQualityBanner from '../NetworkQualityBanner';
import AdVideoPreroll from '../AdVideoPreroll';
import InSessionAdPanel from '../ads/InSessionAdPanel';
import { calculateAge } from '../../utils/ageUtils';

function SessionEndedOverlay({ reason, onReturn }) {
  const [countdown, setCountdown] = React.useState(8);
  const returnCalledRef = React.useRef(false);

  const triggerReturn = React.useCallback(() => {
    if (returnCalledRef.current) return;
    returnCalledRef.current = true;
    onReturn();
  }, [onReturn]);

  // One setTimeout per tick — stops scheduling when countdown reaches 0, never goes negative.
  React.useEffect(() => {
    if (countdown <= 0) {
      triggerReturn();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, triggerReturn]);

  const message =
    reason === 'connection_lost'
      ? 'Your connection to the session was lost.'
      : 'This watch session has ended.';

  return (
    <div className="fixed inset-0 bg-black/85 flex flex-col items-center justify-center z-[9999]">
      <div className="text-5xl mb-5">📺</div>
      <h2 className="text-2xl font-bold text-white mb-2">Session Ended</h2>
      <p className="text-gray-400 text-center mb-8 max-w-xs">{message}</p>
      <button
        onClick={triggerReturn}
        className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
      >
        Return to Room
      </button>
      <p className="text-gray-600 text-sm mt-4">Auto-returning in {countdown}s</p>
    </div>
  );
}

const PREVIEW_INTERVAL = import.meta.env.DEV ? 60_000 : 300_000;

export default function VideoWatch() {
  const componentIdRef = useRef(`VideoWatch-${Date.now()}`);
  
  // Add CSS animation for banner text sliding
  useEffect(() => {
    const styleId = 'banner-animation-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@700&display=swap');
        
        @keyframes slideUpBanner {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          45% {
            transform: translateY(0);
            opacity: 1;
          }
          55% {
            transform: translateY(-30%);
            opacity: 0.7;
          }
          100% {
            transform: translateY(-30%);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);
  
  // 📋 CAPTURE LOGS: Intercept console methods and store logs globally
  useEffect(() => {
    // Initialize global log storage
    if (!window.capturedLogs) {
      window.capturedLogs = [];
    }
    
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    
    // Intercept console methods and store logs
    console.log = (...args) => {
      window.capturedLogs.push({ type: 'log', time: Date.now(), args });
      originalLog(...args);
    };
    console.warn = (...args) => {
      window.capturedLogs.push({ type: 'warn', time: Date.now(), args });
      originalWarn(...args);
    };
    console.error = (...args) => {
      window.capturedLogs.push({ type: 'error', time: Date.now(), args });
      originalError(...args);
    };
    console.info = (...args) => {
      window.capturedLogs.push({ type: 'info', time: Date.now(), args });
      originalInfo(...args);
    };
    
    console.log('📋 [VideoWatch] Log capture started - logs stored in window.capturedLogs');
    
    // Cleanup on unmount
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, []);
  
  // Move these to top before any useEffect that uses them
  const location = useLocation();
  const [roomHostId, setRoomHostId] = useState(null);
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { currentUser, wsToken, loading: authLoading } = useAuth();
  
  useEffect(() => {
    console.log(`🏁🏁🏁 [${componentIdRef.current}] COMPONENT MOUNTED`);
    return () => {
      console.log(`💀💀💀 [${componentIdRef.current}] COMPONENT UNMOUNTED`);
      clearInterval(previewIntervalRef.current);
    };
  }, []);
  
  // 🎁 Fetch wallet balance on mount
  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const response = await apiClient.get('/api/wallets/me');
        setTokenBalance(response.data?.wallet?.token_balance || 0);
      } catch (err) {
        console.error('Error fetching wallet:', err);
        setTokenBalance(0);
      }
    };
    
    if (currentUser) {
      fetchWallet();
    }
  }, [currentUser]);
  

  const stableTokenRef = useRef(null);
  if (!authLoading && wsToken && !stableTokenRef.current) {
    stableTokenRef.current = wsToken;
  }

  // ✅ Extract session_id from URL for WebSocket connection and instant watch flag
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('session_id');
  const isInstantWatch = urlParams.get('instant') === 'true';
  
  // ✅ Initialize WebSocket connection (must be before hooks that use sessionStatus)
  const { sendMessage, messages, isConnected, sessionStatus, setBinaryMessageHandler, clearMessages } = useWebSocket(
    roomId,
    stableTokenRef.current,
    urlSessionId  // ✅ Pass session_id to WebSocket so backend can add us to session members
  );
  
  // 🔍 DEBUG: Track sessionStatus changes
  useEffect(() => {
    console.log('📊 [SESSION STATUS] Update received:', {
      sessionStatus,
      hasLiveShareActive: sessionStatus && 'liveShareActive' in sessionStatus,
      liveShareActiveValue: sessionStatus?.liveShareActive,
      sessionId: sessionStatus?.id,
      hostId: sessionStatus?.hostId,
      isActive: sessionStatus?.isActive
    });
  }, [sessionStatus]);
  
  // ❤️ Fetch initial like status
  useEffect(() => {
    const fetchLikeStatus = async () => {
      const activeSessionId = sessionStatus?.id || urlSessionId;
      if (!activeSessionId) return;
      try {
        const response = await apiClient.get(`/api/sessions/${activeSessionId}/like-status`);
        setIsSessionLiked(response.data.isLiked);
        setSessionLikesCount(response.data.count);
      } catch (err) {
        console.error('Failed to fetch like status:', err);
      }
    };
    
    fetchLikeStatus();
  }, [sessionStatus?.id, urlSessionId]);
  
  // ❤️ Double-click like handler
  const handleDoubleClickLike = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const activeSessionId = sessionStatus?.id || urlSessionId;
    if (!activeSessionId) return;

    // Debounce rapid double-clicks
    const now = Date.now();
    if (now - lastLikeTimeRef.current < 800) return;
    lastLikeTimeRef.current = now;

    // Always show animation locally
    setShowHeartAnimation(true);

    // Broadcast animation to other room members
    if (sendMessage) {
      sendMessage({ type: 'heart_animation', user_id: currentUser?.id });
    }

    // Only hit the API once per session
    if (!isSessionLiked) {
      setIsSessionLiked(true);
      setSessionLikesCount(prev => prev + 1);
      try {
        await apiClient.post(`/api/sessions/${activeSessionId}/like`);
      } catch (err) {
        console.error('Failed to like session:', err);
        setIsSessionLiked(false);
        setSessionLikesCount(prev => prev - 1);
      }
    }
  };

  // 🎯 HYBRID WATCH TYPE DETECTION
  // Primary: Use sessionStatus from WebSocket
  // Fallback: Parse from URL for initial render
  const watchType = sessionStatus?.watch_type || (
    location.pathname.includes('/lecture-hall/') ? 'classroom' :
    location.pathname.includes('/cinema-3d-demo/') ? '3d_cinema' :
    'video'
  );
  const classType = sessionStatus?.class_type || (
    location.pathname.includes('/lecture-hall/') ? 'lecture_hall' : null
  );
  const contentRating = sessionStatus?.content_rating || '';

  // Derived flags for feature detection
  const isClassroom = watchType === 'classroom';
  const isLectureHall = isClassroom && classType === 'lecture_hall';

  // 🎫 Ticket enforcement - check on mount for paid sessions
  useEffect(() => {
    const checkTicket = async () => {
      if (!urlSessionId || !currentUser) return;
      
      try {
        // Get session details to check if ticketing is enabled
        const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
        const sessionDetails = response.data;
        
        if (!sessionDetails || sessionDetails.session_id !== urlSessionId) {
          console.log('❌ [VideoWatch] Session not found or mismatch');
          return;
        }
        
        const isUserHost = currentUser.id === sessionDetails.host_id;

        // Set roomHostId immediately from the REST response so isHost is correct
        // before the WS session_status message arrives (eliminates the race condition
        // where LeftSidebar only shows the upload tab on refresh).
        if (sessionDetails?.host_id) {
          setRoomHostId(Number(sessionDetails.host_id));
        }
        
        // ✅ AGE VERIFICATION - Check content rating before allowing access
        if (!isUserHost && sessionDetails.content_rating) {
          // Check if user has age set (0 = no DOB provided)
          const userAge = currentUser.age ?? 0;
          if (userAge === 0) {
            console.log('⚠️ [VideoWatch] User has no age/DOB - redirecting');
            toast.error('Please set your date of birth to view this content');
            navigate(`/rooms/${roomId}`, { replace: true });
            return;
          }
          
          // Check age requirements
          const ageRequirements = {
            'G': 0, 'PG': 0, '13+': 13, '16+': 16, '18+': 18, 'Mature': 18
          };
          const requiredAge = ageRequirements[sessionDetails.content_rating];
          
          if (requiredAge && userAge < requiredAge) {
            const errorMessages = {
              '13+': 'This session is rated 13+ and requires viewers to be 13 or older',
              '16+': 'This session is rated 16+ and requires viewers to be 16 or older',
              '18+': 'This session is rated 18+ and requires viewers to be 18 or older',
              'Mature': 'This session is rated Mature and requires viewers to be 18 or older'
            };
            
            console.log('🔒 [VideoWatch] Age restriction:', {
              userAge,
              contentRating: sessionDetails.content_rating,
              requiredAge
            });
            
            toast.error(errorMessages[sessionDetails.content_rating] || 'You do not meet the age requirement for this session');
            navigate(`/rooms/${roomId}`, { replace: true });
            return;
          }
          
          console.log('✅ [VideoWatch] Age verification passed:', {
            userAge,
            contentRating: sessionDetails.content_rating
          });
        }
        
        // ✅ TICKET CHECK
        if (sessionDetails.ticketing_enabled && !isUserHost) {
          console.log('🎟️ [VideoWatch] Paid session detected, checking ticket...');
          
          // Check cache first
          if (!hasTicketCache(sessionDetails.id)) {
            console.log('❌ [VideoWatch] No ticket found - redirecting to room page');
            toast.error('This is a paid session. Please purchase a ticket.');
            navigate(`/rooms/${roomId}?openTicketModal=true`);
            return;
          }
          
          console.log('✅ [VideoWatch] Ticket verified in cache');
        }
      } catch (err) {
        console.error('❌ [VideoWatch] Failed to check ticket:', err);
      }
    };
    
    checkTicket();
  }, [urlSessionId, currentUser, roomId, navigate]);

  // Handle session errors - only navigate if session is actually dead
  useEffect(() => {
    if (!sessionStatus?.error || sessionStatus?.isActive) return;
    console.error('❌ Session error detected:', sessionStatus.error);

    // Verify the session is actually gone before kicking the user out.
    // A WS reconnect failure sets isActive=false even when the session is still live
    // (e.g. Chrome froze the tab). Confirm via REST before acting.
    getActiveSession(roomId)
      .then(res => {
        const session = res?.data;
        // Backend returns is_existing:true when an active session is found
        if (session?.is_existing) {
          console.warn('⚠️ WS reported session dead but REST confirms it is still active — suppressing kick');
          return;
        }
        setSessionEndedInfo({ reason: 'connection_lost' });
      })
      .catch(err => {
        if (err?.response?.status === 404 || err?.response?.status === 410) {
          setSessionEndedInfo({ reason: 'ended' });
        }
        // For network errors, give benefit of the doubt — don't navigate
      });
  }, [sessionStatus?.error, sessionStatus?.isActive, roomId]);

  // Heartbeat: poll every 60s to catch session-ended when WS was down at broadcast time.
  // Requires 2 consecutive "session gone" responses before acting — prevents a single
  // bad response from kicking users who are sharing their screen in another tab.
  useEffect(() => {
    const activeSessionId = sessionStatus?.id || urlSessionId;
    if (!activeSessionId || !roomId) return;

    let consecutiveMisses = 0;

    const interval = setInterval(async () => {
      try {
        const res = await getActiveSession(roomId);
        const session = res?.data;
        // Backend returns is_existing:true when an active session is found.
        // is_active is not in the response — checking it would always be undefined (falsy).
        if (!session?.is_existing) {
          consecutiveMisses++;
          if (consecutiveMisses >= 2) {
            clearInterval(interval);
            setSessionEndedInfo({ reason: 'ended' });
          }
        } else {
          consecutiveMisses = 0; // reset on a healthy response
        }
      } catch (err) {
        if (err?.response?.status === 404 || err?.response?.status === 410) {
          clearInterval(interval);
          setSessionEndedInfo({ reason: 'ended' });
        }
        // Network hiccups (5xx, timeout) are ignored — don't penalise tab-switchers
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [sessionStatus?.id, urlSessionId, roomId]);

  // ✅ LIVEKIT INTEGRATION with auto-subscribe (everyone hears everyone)
  const {
    room,
    localParticipant,
    remoteParticipants,
    isConnected: isLiveKitConnected,
    connect: connectLiveKit,
    disconnect: disconnectLiveKit
  } = useLiveKitRoom(roomId, currentUser, true); // ✅ autoSubscribe=true for watch sessions

  const networkQuality = useNetworkQuality(room);

  // 🎥 ALL STATE DECLARATIONS (must be before useEffects that use them)
  const [sessionEndedInfo, setSessionEndedInfo] = useState(null); // { reason: 'ended' | 'connection_lost' }
  const [currentMedia, setCurrentMedia] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackPositionRef = useRef(0);
  const [activeTab, setActiveTab] = useState('media');
  const [seats, setSeats] = useState([]);
  const [userSeats, setUserSeats] = useState({});
  const [isSeatsModalOpen, setIsSeatsModalOpen] = useState(false);
  const notificationIdRef = useRef(0);
  const [notifications, setNotifications] = useState([]);
  const [pendingSeatRequests, setPendingSeatRequests] = useState([]);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  
  // ❤️ Session like state
  const [isSessionLiked, setIsSessionLiked] = useState(false);
  const [sessionLikesCount, setSessionLikesCount] = useState(0);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const lastLikeTimeRef = useRef(0);
  const isExitingRef = useRef(false); // guard against double-exit (WS session_ended + manual Leave)
  
  // 📺 Ad pre-roll disabled — join experience should feel instant and classy
  const [showAdPreroll, setShowAdPreroll] = useState(false); // eslint-disable-line no-unused-vars
  
  // 🎯 Banner ad state (80-20 split)
  const [bannerAdData, setBannerAdData] = useState(null);
  const [adEligible, setAdEligible] = useState(false);
  const [fetchingBannerAd, setFetchingBannerAd] = useState(false);
  
  const [isLiveShareWizardOpen, setIsLiveShareWizardOpen] = useState(false); // ✅ Track wizard modal state for taskbar
  const [isVideoSidebarOpen, setIsVideoSidebarOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isGlowing, setIsGlowing] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [activePlatformShare, setActivePlatformShare] = useState(null);
  // 🪑 Seats Mode: Only enabled for 3D Cinema & Lecture Hall (row-based audio)
  // VideoWatch (2D) = No seats, everyone in global audio space
  const [isSeatedMode] = useState(watchType !== 'video');
  const [cameraPreviewStream, setCameraPreviewStream] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(false);
  const [screenSharerUserId, setScreenSharerUserId] = useState(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sessionChatMessages, setSessionChatMessages] = useState([]);
  const [newSessionMessage, setNewSessionMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showCinemaSeatView, setShowCinemaSeatView] = useState(false);
  const [isHostBroadcasting, setIsHostBroadcasting] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [roomData, setRoomData] = useState(null); // Store room data including is_public
  
  // Breaking News Banner state (DOM-based)
  const [bannerState, setBannerState] = useState(null);
  
  // Banner text line cycling state
  const [currentBannerLineIndex, setCurrentBannerLineIndex] = useState(0);
  const [bannerTextLines, setBannerTextLines] = useState([]);
  
  // 📱 Responsive state for LiveShare graphics
  const [screenSize, setScreenSize] = useState('desktop'); // 'mobile' | 'tablet' | 'desktop'
  
  // 🔍 Debug: Log roomMembers changes
  useEffect(() => {
    console.log('👥 [VideoWatch] roomMembers state changed:', roomMembers);
    console.log('👥 [VideoWatch] roomMembers count:', roomMembers?.length);
  }, [roomMembers]);
  
  // 📱 Detect screen size for responsive LiveShare graphics
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setScreenSize('mobile');
      } else if (width < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };
    
    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // 🎯 Fetch banner ad after preroll completes
  useEffect(() => {
    const fetchBannerAd = async () => {
      // Only fetch if preroll is done and we don't have an ad yet
      if (showAdPreroll || bannerAdData || fetchingBannerAd || !currentUser || !sessionStatus?.id) return;
      
      setFetchingBannerAd(true);
      
      try {
        // Calculate user age
        const userAge = currentUser.date_of_birth ? calculateAge(currentUser.date_of_birth) : 0;
        
        // Fetch banner/GIF ad
        const response = await apiClient.get('/api/ads/in-session', {
          params: {
            user_id: currentUser.id,
            session_id: sessionStatus.id,
            ad_type: 'banner', // GIF/image ads only
            placement: 'in_session',
            user_age: userAge
          }
        });
        
        if (response.data.ad) {
          console.log('🎯 [VideoWatch] Banner ad fetched:', response.data.ad);
          setBannerAdData(response.data.ad);
          setAdEligible(true);
        } else {
          console.log('🎯 [VideoWatch] No banner ad available');
          setAdEligible(false);
        }
      } catch (err) {
        console.error('❌ [VideoWatch] Failed to fetch banner ad:', err);
        setAdEligible(false);
      } finally {
        setFetchingBannerAd(false);
      }
    };
    
    // Fetch ad after a delay to avoid overlapping with other UI
    const timer = setTimeout(fetchBannerAd, 2000);
    return () => clearTimeout(timer);
  }, [showAdPreroll, currentUser, sessionStatus?.id, bannerAdData, fetchingBannerAd]);
  
  // 📰 Banner text line cycling effect
  useEffect(() => {
    if (!bannerTextLines || bannerTextLines.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentBannerLineIndex(prev => {
        // Mobile: increment by 2 (show 2 lines, skip both on next cycle)
        // Desktop: increment by 1 (show 1 line at a time)
        const increment = screenSize === 'mobile' ? 2 : 1;
        return (prev + increment) % bannerTextLines.length;
      });
    }, 5000); // Change line every 5 seconds
    
    return () => clearInterval(interval);
  }, [bannerTextLines, screenSize]);
  
  // 📏 Measure and split banner text into lines that fit
  useEffect(() => {
    if (!bannerState?.text) {
      setBannerTextLines([]);
      return;
    }
    
    // Get logo size for calculation
    let logoSize = 100;
    try {
      const sessionId = sessionStatus?.id;
      if (sessionId) {
        const savedLogoStyles = localStorage.getItem(`podcast_logo_style_${sessionId}`);
        if (savedLogoStyles) {
          const styles = JSON.parse(savedLogoStyles);
          logoSize = styles.size || 100;
        }
      }
    } catch (err) {
      console.warn('Failed to load logo styles:', err);
    }
    
    const bannerHeight = bannerState.podcastLogoSize || 100;
    const fontSize = screenSize === 'mobile' 
      ? Math.max(14, bannerHeight * 0.4) // Mobile: smaller font for 2 lines
      : Math.max(14, bannerHeight * 0.7); // Desktop: larger font for 1 line
    const availableWidth = window.innerWidth - logoSize - (screenSize === 'mobile' ? 10 : 20); // Responsive gap
    
    // Create temporary measuring element with responsive font
    const measureEl = document.createElement('div');
    measureEl.style.position = 'absolute';
    measureEl.style.visibility = 'hidden';
    measureEl.style.whiteSpace = 'nowrap';
    measureEl.style.fontSize = `${fontSize}px`;
    measureEl.style.fontFamily = screenSize === 'mobile' 
      ? "'Archivo Narrow', 'Roboto Condensed', 'Arial Narrow', sans-serif"
      : "'Roboto Condensed', 'Arial Narrow', sans-serif";
    measureEl.style.fontWeight = screenSize === 'mobile' ? '500' : '700'; // Medium on mobile
    measureEl.style.letterSpacing = screenSize === 'mobile' ? '-0.05em' : 'normal';
    document.body.appendChild(measureEl);
    
    // Split text into lines based on actual measurement
    const words = bannerState.text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      measureEl.textContent = testLine;
      
      if (measureEl.offsetWidth <= availableWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    // Cleanup
    document.body.removeChild(measureEl);
    
    setBannerTextLines(lines);
    setCurrentBannerLineIndex(0); // Reset to first line
  }, [bannerState?.text, bannerState?.podcastLogoSize, sessionStatus?.id, screenSize]); // Re-measure on screen size change
  
  // ✅ Fetch session members from API (active watch session participants)
  useEffect(() => {
    // console.log('🔄 [fetchSessionMembers useEffect] TRIGGERED with roomId:', roomId);
    
    const fetchSessionMembers = async () => {
      // console.log('🚀 [fetchSessionMembers] Function starting...');
      // console.log('🔍 [fetchSessionMembers] roomId value:', roomId, 'type:', typeof roomId);
      
      if (!roomId) {
        console.warn('⚠️ [fetchSessionMembers] No roomId, ABORTING fetch');
        return;
      }
      
      try {
        // console.log('📡 [fetchSessionMembers] ✅ About to call getActiveSession API for room:', roomId);
        const response = await getActiveSession(roomId);
        // console.log('📥 [fetchSessionMembers] ✅ API call completed successfully');
        // console.log('📥 [fetchSessionMembers] Full response object:', response);
        // console.log('📥 [fetchSessionMembers] response.data:', response.data);
        // console.log('📥 [fetchSessionMembers] response.data type:', typeof response.data);
        // console.log('📥 [fetchSessionMembers] response.data.members:', response.data?.members);
        
        const sessionMembers = response.data?.members || [];
        // console.log('👥 [fetchSessionMembers] Extracted sessionMembers array:', sessionMembers);
        // console.log('👥 [fetchSessionMembers] sessionMembers.length:', sessionMembers.length);
        // console.log('👥 [fetchSessionMembers] Is array?:', Array.isArray(sessionMembers));
        
        if (sessionMembers.length > 0) {
          // console.log('✅ [fetchSessionMembers] Found', sessionMembers.length, 'members:');
          // sessionMembers.forEach((m, idx) => {
          //   console.log(`  Member ${idx + 1}:`, {
          //     user_id: m.user_id,
          //     username: m.username,
          //     user_role: m.user_role,
          //     raw: m
          //   });
          // });
        } else {
          console.warn('⚠️ [fetchSessionMembers] sessionMembers array is EMPTY');
        }
        
        // Transform to match component format
        // console.log('🔄 [fetchSessionMembers] Transforming members to component format...');
        const formattedMembers = sessionMembers.map(member => {
          const formatted = {
            id: member.user_id,
            Username: member.username || `User ${member.user_id}`,
            username: member.username || `User ${member.user_id}`,
            avatar_url: member.avatar_url || null,
            user_role: member.user_role || 'viewer',
          };
          // console.log('  Formatted member:', formatted);
          return formatted;
        });
        
        // console.log('📤 [fetchSessionMembers] About to call setRoomMembers with', formattedMembers.length, 'members');
        // console.log('📤 [fetchSessionMembers] formattedMembers:', formattedMembers);
        setRoomMembers(formattedMembers);
        // console.log('✅ [fetchSessionMembers] setRoomMembers called successfully');
        setIsMembersInitialized(true);

      } catch (error) {
        console.error('❌ [fetchSessionMembers] API call FAILED');
        console.error('❌ [fetchSessionMembers] Error object:', error);
        console.error('❌ [fetchSessionMembers] Error message:', error?.message);
        console.error('❌ [fetchSessionMembers] Error response:', error?.response);
        console.error('❌ [fetchSessionMembers] Error response data:', error?.response?.data);
        console.error('❌ [fetchSessionMembers] Error response status:', error?.response?.status);
        // Don't show error to user - member list will populate from WebSocket events
        setIsMembersInitialized(true);
      }
    };
    
    fetchSessionMembers();
    // Retry after 10s — catches Railway cold-start delay where the first fetch
    // returns empty before the container has fully woken up.
    const retryTimer = setTimeout(fetchSessionMembers, 10000);
    return () => clearTimeout(retryTimer);
  }, [roomId]);

  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isMembersInitialized, setIsMembersInitialized] = useState(false);
  // Viewer-side break overlay state (static source only — other sources use GraphicsRenderer canvas)
  const [isBreakActive, setIsBreakActive] = useState(false);
  const [viewerBreakEndTime, setViewerBreakEndTime] = useState(null);
  const [viewerBreakSeconds, setViewerBreakSeconds] = useState(0);

  // Viewer break countdown — ticks while a static break is active
  useEffect(() => {
    if (!viewerBreakEndTime) return;
    const tick = () => {
      if (document.hidden) return;
      setViewerBreakSeconds(Math.max(0, Math.floor((viewerBreakEndTime - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [viewerBreakEndTime]);
  const [screenShareUrl, setScreenShareUrl] = useState(null);
  const sidebarRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const chatEndRef = useRef(null);
  const videoPlayerRef = useRef(null); // 🎬 Direct access to video element
  const [localScreenTrack, setLocalScreenTrack] = useState(null);
  const [pendingSeekTime, setPendingSeekTime] = useState(null); // ⏱️ State-based seek (triggers re-renders)
  const wsArrivalTimeRef = useRef(null); // ⏱️ Tracks WS message arrival time for post-play correction
  const syncRefRef = useRef(null);       // 💓 Last heartbeat reference: { hostTime, receivedAt }
  
  // 📹 LiveShare state (screen + camera)
  const [liveShareMode, setLiveShareMode] = useState(null); // 'screen', 'camera', 'both' - the share type
  const [liveShareContentMode, setLiveShareContentMode] = useState(null); // 'regular', 'podcast', 'news', 'show' - the content mode
  const [selectedLiveShareLayout, setSelectedLiveShareLayout] = useState(null); // 'solo-view', 'screen-share', 'split-view'
  const [sharingSource, setSharingSource] = useState(null); // 'liveshare' | 'watchfrom' | null
  const [hasLiveSharePermission, setHasLiveSharePermission] = useState(false); // Guest permission for LiveShare
  const [forceActiveTab, setForceActiveTab] = useState(null); // Force LeftSidebar to specific tab
  const [podcastConfig, setPodcastConfig] = useState(null); // { title, logoUrl, titleStyle, logoStyle, guestUserId, hostUsername, sessionId }
  const [guestInviteAutoTrigger, setGuestInviteAutoTrigger] = useState(null); // { mode, title, hostUsername } — auto-opens guest popup
  const [liveShareGuestId, setLiveShareGuestId] = useState(null); // Selected guest ID for LiveShare (for mute exemption)
  const [currentBibleVerse, setCurrentBibleVerse] = useState(null); // Current Bible verse for church mode
  const [isBibleVerseActive, setIsBibleVerseActive] = useState(false); // Bible verse visibility
  const [currentHymn, setCurrentHymn] = useState(null); // Current hymn for church mode
  const [isHymnActive, setIsHymnActive] = useState(false); // Hymn visibility
  const [currentHymnVerse, setCurrentHymnVerse] = useState(1); // Current verse of hymn
  const [isSermonActive, setIsSermonActive] = useState(false);
  const [sermonPages, setSermonPages] = useState([]);
  const [currentSermonPage, setCurrentSermonPage] = useState(0);
  const [sermonTitle, setSermonTitle] = useState(null);
  const screenShareTrackRef = useRef(null);
  const cameraShareTrackRef = useRef(null);
  const liveShareVideoRef = useRef(null); // Separate ref for LiveShare main video
  const liveShareCameraVideoRef = useRef(null); // Separate ref for LiveShare PIP camera
  const previewIntervalRef = useRef(null); // Periodic liveshare preview capture
  const [screenShareTrackSid, setScreenShareTrackSid] = useState(null);
  const [cameraShareTrackSid, setCameraShareTrackSid] = useState(null);

  // 🎨 Graphics Renderer for LiveShare overlays
  const graphicsCanvasRef = useRef(null);
  const graphicsRendererRef = useRef(null);
  const renderLoopRef = useRef(null);

  // 📝 QUIZ SYSTEM STATE
  const [quizzes, setQuizzes] = useState([]); // All quizzes in this session
  const [activeQuiz, setActiveQuiz] = useState(null); // Currently in-progress quiz
  const [currentQuizData, setCurrentQuizData] = useState(null); // Quiz for student to take
  const [quizResults, setQuizResults] = useState(null); // Student's results
  const [isQuizManagementOpen, setIsQuizManagementOpen] = useState(false);
  const [isMakeQuizOpen, setIsMakeQuizOpen] = useState(false);
  const [isTakeQuizOpen, setIsTakeQuizOpen] = useState(false);
  const [isQuizResultsOpen, setIsQuizResultsOpen] = useState(false);
  
  // 🎮 GAME SYSTEM: State
  const [isGameLobbyOpen, setIsGameLobbyOpen] = useState(false);
  const [activeGame, setActiveGame] = useState(null); // Currently active game session
  
  // 🎤 Audio device management
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(null);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const publishedAudioTrackRef = useRef(null);

  // ✅ Track active session ID for ending sessions
  const [activeSessionId, setActiveSessionId] = useState(null);
  
  // 🧹 LeftSidebar cleanup function ref (for compression state cleanup on session end)
  const leftSidebarCleanupRef = useRef(null);

  // 🪑 Seat swap notifications
  const [seatSwapRequest, setSeatSwapRequest] = useState(null);
  const [showChatHome, setShowChatHome] = useState(false);
  const [privateChatUser, setPrivateChatUser] = useState(null);
  const [showPrivateChat, setShowPrivateChat] = useState(false);
  const [privateMessages, setPrivateMessages] = useState({});
  const [unreadMessages, setUnreadMessages] = useState({}); // {userId: unreadCount} - ✅ Unread tracking

  // 🔇 Silence mode state
  const [isSilenceMode, setIsSilenceMode] = useState(false);
  
  // 🎁 Wallet balance for gifting
  const [tokenBalance, setTokenBalance] = useState(0);

  // 🔊 Broadcast permissions tracking
  const [broadcastPermissions, setBroadcastPermissions] = useState({}); // userId -> boolean
  const [remoteAudioStates, setRemoteAudioStates] = useState({}); // userId -> {isSpeaking, audioLevel, isMuted}
  
  // 🔇 Host mute control
  const [isMutedByHost, setIsMutedByHost] = useState(false); // Locked mute by host
  const [showMuteAllBanner, setShowMuteAllBanner] = useState(false); // Show mute notification
  const [isMuteAllActive, setIsMuteAllActive] = useState(false); // Track toggle state for host

  // ✋ Raised hands tracking
  const [raisedHands, setRaisedHands] = useState([]); // Array of {userId, username, timestamp}
  const [isHandRaised, setIsHandRaised] = useState(false); // Current user's hand state
  
  // 😊 Emote system
  const [localEmotes, setLocalEmotes] = useState([]); // Floating emotes for current user
  const [memberEmotes, setMemberEmotes] = useState({}); // Map of userId -> {emote, timestamp} for member cards
  const emoteSounds = useEmoteSounds();
  const playEmoteSound = emoteSounds?.playEmoteSound || (() => {
    console.warn('⚠️ [VideoWatch] playEmoteSound not available');
  });

  // 🎭 Determine if current user is host (MUST BE BEFORE useEffects that use isHost)
  const isHost = React.useMemo(() => {
    // ✅ Primary: Use sessionStatus.hostId from WebSocket
    // ✅ Fallback: Use roomHostId from session_status members
    const hostId = sessionStatus?.hostId || roomHostId;
    // Normalize both sides to Number — JWT/localStorage may return a string
    // while WS/API may return a number, so === would silently fail.
    const result = !!hostId && Number(currentUser?.id) === Number(hostId);

    return result;
  }, [currentUser?.id, sessionStatus?.hostId, roomHostId]);

  // 🛡️ Determine if current user is a room admin
  const isAdmin = React.useMemo(() => {
    const me = roomMembers.find(m => m.id === currentUser?.id);
    return me?.user_role === 'admin';
  }, [roomMembers, currentUser?.id]);

  // 🔄 MEMBER: Request current playback state on connect/reconnect
  useEffect(() => {
    if (!isConnected || !currentUser?.id || isHost) return;
    
    // Wait a moment for host to be established
    const timer = setTimeout(() => {
      console.log('🔄 [VideoWatch] MEMBER requesting current state from host');
      sendMessage({
        type: 'request_playback_state',
        requester_id: currentUser.id,
        timestamp: Date.now()
      });
    }, 500); // Small delay to ensure host is ready
    
    return () => clearTimeout(timer);
  }, [isConnected, currentUser?.id, isHost, sendMessage]);

  // ✅ Connect to LiveKit when room and user are ready
  const hasAttemptedLiveKitConnection = useRef(false);
  
  useEffect(() => {
    if (!roomId || !currentUser?.id || hasAttemptedLiveKitConnection.current) {
      console.log('⏳ [VideoWatch] Waiting for LiveKit connection requirements:', {
        hasRoomId: !!roomId,
        hasCurrentUser: !!currentUser?.id,
        hasAttempted: hasAttemptedLiveKitConnection.current
      });
      return;
    }
    
    console.log('🎵 [VideoWatch] Connecting to LiveKit for room:', roomId, 'user:', currentUser.id);
    hasAttemptedLiveKitConnection.current = true;
    connectLiveKit();
    
    return () => {
      console.log('🔌 [VideoWatch] Disconnecting from LiveKit');
      disconnectLiveKit();
      hasAttemptedLiveKitConnection.current = false;
    };
  }, [roomId, currentUser?.id, connectLiveKit, disconnectLiveKit]);

  // 🎨 Initialize GraphicsRenderer for LiveShare overlays
  useEffect(() => {
    // Determine if LiveShare is active for this user
    // HOST: Check liveShareMode (set when they start sharing)
    // MEMBER: Check liveShareContentMode (set when they receive mode broadcast)
    const isLiveShareActive = isHost ? liveShareMode : liveShareContentMode;
    
    // 🔍 DEBUG: Log renderer initialization attempt
    console.log('🔍 [GRAPHICS INIT] Checking renderer initialization:', {
      liveShareMode,
      liveShareContentMode,
      isLiveShareActive,
      isHost,
      sessionStatus: sessionStatus,
      hasCanvas: !!graphicsCanvasRef.current,
      hasRenderer: !!graphicsRendererRef.current,
      userRole: isHost ? 'HOST' : 'MEMBER',
      currentUserId: currentUser?.id,
      currentUserName: currentUser?.username
    });
    
    if (!isLiveShareActive) {
      console.log('⚠️ [GRAPHICS INIT] Blocked: No active LiveShare session');
      console.log('   → User role:', isHost ? 'HOST' : 'MEMBER');
      console.log('   → liveShareMode (HOST):', liveShareMode);
      console.log('   → liveShareContentMode (MEMBER):', liveShareContentMode);
      
      // No LiveShare mode - cleanup if renderer exists
      if (graphicsRendererRef.current) {
        console.log('🧹 [GRAPHICS INIT] Cleaning up existing renderer');
        if (renderLoopRef.current) {
          cancelAnimationFrame(renderLoopRef.current);
          renderLoopRef.current = null;
        }
        graphicsRendererRef.current = null;
      }
      return;
    }
    
    if (!graphicsCanvasRef.current) {
      console.error('❌ [GRAPHICS INIT] Canvas ref is null - cannot initialize renderer');
      return;
    }
    
    if (graphicsRendererRef.current) {
      console.log('ℹ️ [GRAPHICS INIT] Renderer already exists, skipping initialization');
      return;
    }
    
    console.log('🎨 [VideoWatch] Initializing GraphicsRenderer');
    console.log('   → User role:', isHost ? 'HOST' : 'MEMBER');
    console.log('   → Active mode:', isLiveShareActive);
    console.log('   → Canvas dimensions: 1920x1080');
    
    // Initialize renderer
    const renderer = new GraphicsRenderer(graphicsCanvasRef.current);
    renderer.init(1920, 1080); // Standard HD resolution
    graphicsRendererRef.current = renderer;
    
    // Start render loop
    const renderLoop = () => {
      renderer.render();
      renderLoopRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    
    console.log('🎨 [VideoWatch] GraphicsRenderer initialized and rendering');
    console.log('   → Initialized for:', isHost ? 'HOST' : 'MEMBER');
    console.log('   → Active mode:', isLiveShareActive);
    
    // Cleanup
    return () => {
      if (renderLoopRef.current) {
        cancelAnimationFrame(renderLoopRef.current);
        renderLoopRef.current = null;
      }
      graphicsRendererRef.current = null;
    };
  }, [liveShareMode, liveShareContentMode, isHost]);

  // 🎨 Listen for graphics updates via WebSocket
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage.type === 'liveshare_graphics_update') {
      const { graphic } = lastMessage.data;
      
      // 🔍 DEBUG: Comprehensive graphics update logging
      console.log('═══════════════════════════════════════════════════════');
      console.log('📨 [GRAPHICS UPDATE] WebSocket message received');
      console.log('User Role:', isHost ? 'HOST' : 'MEMBER');
      console.log('User:', currentUser?.username, `(ID: ${currentUser?.id})`);
      console.log('───────────────────────────────────────────────────────');
      console.log('Graphic Details:', {
        type: graphic.type,
        active: graphic.active,
        content: graphic.content,
        position: graphic.position,
        zIndex: graphic.z_index
      });
      console.log('───────────────────────────────────────────────────────');
      console.log('Renderer State:', {
        hasRenderer: !!graphicsRendererRef.current,
        hasCanvas: !!graphicsCanvasRef.current,
        liveShareMode: liveShareMode,
        rendererInitialized: graphicsRendererRef.current ? 'YES ✅' : 'NO ❌'
      });
      console.log('═══════════════════════════════════════════════════════');
      
      // Handle banner separately with DOM rendering
      if (graphic.type === 'banner') {
        console.log('📰 [BANNER] Processing banner update (DOM rendering)');
        if (graphic.active) {
          console.log('✅ [BANNER] Showing banner:', graphic.content);
          setBannerState(graphic.content);
        } else {
          console.log('🚫 [BANNER] Hiding banner');
          setBannerState(null);
        }
        return;
      }

      // Handle studio config updates (titleStyle / logoStyle) via state — no canvas needed
      if (graphic.type === 'studio_config') {
        if (graphic.content) {
          setPodcastConfig(prev => prev ? {
            ...prev,
            ...(graphic.content.titleStyle && { titleStyle: graphic.content.titleStyle }),
            ...(graphic.content.logoStyle && { logoStyle: graphic.content.logoStyle }),
          } : prev);
        }
        return;
      }

      // Check if renderer exists
      if (!graphicsRendererRef.current) {
        console.error('❌ [GRAPHICS UPDATE] CRITICAL ERROR: Cannot render graphics');
        console.error('   → Reason: graphicsRendererRef.current is null');
        console.error('   → User Role:', isHost ? 'HOST' : 'MEMBER');
        console.error('   → liveShareMode:', liveShareMode || 'null/undefined');
        console.error('   → liveShareContentMode:', liveShareContentMode || 'null/undefined');
        console.error('   → Graphic type:', graphic.type);
        console.error('   → This indicates the renderer was not initialized properly');
        console.error('   → Check if LiveShare session is active and renderer useEffect ran');
        return;
      }
      
      if (!graphic) {
        console.error('❌ [GRAPHICS UPDATE] Graphic data is null/undefined');
        return;
      }
      
      // Render graphics on canvas
      if (graphic.active) {
        console.log('➕ [CANVAS] Adding layer:', graphic.type);
        console.log('   Content:', graphic.content);
        
        graphicsRendererRef.current.addLayer(graphic.type, {
          type: graphic.type,
          content: graphic.content,
          position: graphic.position,
          zIndex: graphic.z_index || 1
        });
        
        const layerCount = graphicsRendererRef.current.layers.length;
        console.log('✅ [CANVAS] Layer added successfully');
        console.log('   Total layers:', layerCount);
        console.log('   Active layers:', graphicsRendererRef.current.layers.map(l => l.type));
      } else {
        console.log('➖ [CANVAS] Removing layer:', graphic.type);
        graphicsRendererRef.current.removeLayer(graphic.type);
        console.log('✅ [CANVAS] Layer removed');
      }
    }
  }, [messages, liveShareMode]);
  
  // 📖 Listen for Bible verse updates (Church mode)
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage.type === 'bible_verse_update') {
      console.log('📖 [VideoWatch] Bible verse update received:', lastMessage.data);
      
      const { verse, active } = lastMessage.data;
      
      if (active && verse) {
        console.log('✅ [Bible] Showing verse:', verse.reference);
        setCurrentBibleVerse(verse);
        setIsBibleVerseActive(true);
      } else {
        console.log('🚫 [Bible] Hiding verse');
        setCurrentBibleVerse(null);
        setIsBibleVerseActive(false);
      }
    }
    
    if (lastMessage.type === 'hymn_update') {
      console.log('🎵 [VideoWatch] Hymn update received:', lastMessage.data);

      const { hymn, verse, active } = lastMessage.data;

      if (active && hymn) {
        console.log('✅ [Hymn] Showing hymn:', hymn.title, 'verse:', verse);
        setCurrentHymn(hymn);
        setCurrentHymnVerse(verse || 1);
        setIsHymnActive(true);
      } else {
        console.log('🚫 [Hymn] Hiding hymn');
        setCurrentHymn(null);
        setCurrentHymnVerse(1);
        setIsHymnActive(false);
      }
    }

    if (lastMessage.type === 'sermon_update') {
      const { active, pages, title, currentPage } = lastMessage.data;
      if (active && pages?.length) {
        setSermonPages(pages);
        setSermonTitle(title || null);
        setCurrentSermonPage(currentPage ?? 0);
        setIsSermonActive(true);
      } else {
        setIsSermonActive(false);
        setSermonPages([]);
        setSermonTitle(null);
        setCurrentSermonPage(0);
      }
    }

    if (lastMessage.type === 'sermon_navigate') {
      const { currentPage } = lastMessage.data;
      if (currentPage != null) setCurrentSermonPage(currentPage);
    }
  }, [messages]);
  
  // 🎨 Update break screen countdown timer every second
  useEffect(() => {
    if (!graphicsRendererRef.current) return;
    
    const breakLayer = graphicsRendererRef.current.layers.find(l => l.type === 'break_screen');
    if (!breakLayer) return;
    
    const interval = setInterval(() => {
      const breakLayerCurrent = graphicsRendererRef.current.layers.find(l => l.type === 'break_screen');
      if (breakLayerCurrent && breakLayerCurrent.content.timeRemaining > 0) {
        breakLayerCurrent.content.timeRemaining -= 1;
        graphicsRendererRef.current.render();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [messages]); // Re-run when messages change (including break_started)
  
  // 🔍 Debug: Log LiveKit connection status changes
  useEffect(() => {
    console.log('🔍 [VideoWatch] LiveKit status:', {
      isLiveKitConnected,
      hasLocalParticipant: !!localParticipant,
      hasRoom: !!room,
      roomState: room?.state,
      localParticipantIdentity: localParticipant?.identity,
      remoteParticipantsCount: room?.remoteParticipants?.size || 0
    });
  }, [isLiveKitConnected, localParticipant, room]);

  // ✅ Listen for remote participant track events and attach audio elements for playback
  useEffect(() => {
    if (!room) return;

    // Store audio elements for cleanup
    const audioElements = new Map(); // participant.sid -> audioElement

    // Helper function to attach audio track to DOM
    const attachAudioTrack = (track, participant) => {
      console.log('🔊 [VideoWatch] Attaching audio track from', participant.identity);
      console.log('🔍 [VideoWatch Audio Debug] Track details:', {
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        mediaStreamTrack: track.mediaStreamTrack,
        readyState: track.mediaStreamTrack?.readyState
      });
      
      try {
        // Create audio element and attach track
        const audioElement = track.attach();
        
        // Configure audio element for playback
        audioElement.volume = 1.0; // Full volume
        audioElement.autoplay = true; // Auto-play when track starts
        audioElement.muted = false; // Ensure NOT muted
        audioElement.style.display = 'none'; // Hidden
        
        // CRITICAL: Log audio element state
        console.log('🔍 [VideoWatch Audio Debug] Audio element created:', {
          volume: audioElement.volume,
          muted: audioElement.muted,
          autoplay: audioElement.autoplay,
          srcObject: audioElement.srcObject,
          paused: audioElement.paused,
          readyState: audioElement.readyState
        });
        
        // Add to DOM FIRST (required for some browsers)
        document.body.appendChild(audioElement);
        
        // Store reference for cleanup
        const key = `${participant.sid}-audio`;
        
        // Clean up old audio element if exists
        const oldElement = audioElements.get(key);
        if (oldElement) {
          console.warn('⚠️ [VideoWatch] Replacing existing audio element for', participant.identity);
          oldElement.pause();
          oldElement.srcObject = null;
          oldElement.remove();
        }
        
        audioElements.set(key, audioElement);
        
        // Force play the audio (required for some browsers)
        audioElement.play().then(() => {
          console.log('✅ [VideoWatch] Audio playback started for', participant.identity);
          console.log('🔍 [VideoWatch Audio Debug] After play():', {
            paused: audioElement.paused,
            currentTime: audioElement.currentTime,
            volume: audioElement.volume,
            muted: audioElement.muted
          });
        }).catch(err => {
          console.error('❌ [VideoWatch] Audio autoplay FAILED:', err);
          console.error('🔍 [VideoWatch] Audio element state:', {
            paused: audioElement.paused,
            readyState: audioElement.readyState,
            networkState: audioElement.networkState,
            error: audioElement.error
          });
        });
        
      } catch (err) {
        console.error('❌ [VideoWatch] Failed to attach audio track:', err);
      }
    };

    // ✅ CRITICAL FIX: Attach audio elements for ALREADY SUBSCRIBED tracks
    console.log('🔍 [VideoWatch] Checking for existing remote participants...');
    room.remoteParticipants.forEach((participant) => {
      console.log('👤 [VideoWatch] Found existing participant:', participant.identity);
      
      // Check all audio track publications
      participant.audioTrackPublications.forEach((publication) => {
        console.log('🎵 [VideoWatch] Audio publication:', {
          participant: participant.identity,
          trackSid: publication.trackSid,
          isSubscribed: publication.isSubscribed,
          track: publication.track
        });
        
        // If track is already subscribed, attach it now
        if (publication.track && publication.isSubscribed) {
          console.log('🔌 [VideoWatch] Attaching EXISTING audio track from', participant.identity);
          attachAudioTrack(publication.track, participant);
        }
      });
    });

    const handleTrackSubscribed = (track, publication, participant) => {
      console.log('📥 [VideoWatch] Remote track subscribed:', {
        participant: participant.identity,
        source: publication.source,
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted
      });
      
      // ✅ AUDIO PLAYBACK: Attach audio tracks to DOM elements
      if (track.kind === 'audio') {
        attachAudioTrack(track, participant);
      }
      
      // ✅ VIDEO PLAYBACK: Handle screen share and camera tracks
      if (track.kind === 'video') {
        console.log('📹 [VideoWatch] Video track subscribed:', {
          source: publication.source,
          trackName: publication.trackName,
          participant: participant.identity
        });
        
        // Handle screen share tracks for LiveShare
        if (publication.source === Track.Source.ScreenShare) {
          const screenStream = new MediaStream([track.mediaStreamTrack]);
          
          // Check if participant has camera track (for members viewing both)
          const cameraTrackPub = participant.getTrackPublication(Track.Source.Camera);
          let remoteCameraStream = null;
          
          if (cameraTrackPub && cameraTrackPub.track) {
            remoteCameraStream = new MediaStream([cameraTrackPub.track.mediaStreamTrack]);
          }
          
          console.log('✅ [LiveShare] Screen share from:', participant.identity, 'isHost:', isHost);
          
          // ✅ For HOST: Preserve local camera stream, add guest screen
          // ✅ For MEMBER: Use remote camera if available from same participant
          setCurrentMedia(prev => ({
            type: 'liveshare', 
            title: 'LiveShare',
            stream: screenStream,
            cameraStream: isHost ? prev?.cameraStream : remoteCameraStream
          }));
          setIsPlaying(true);
          setIsScreenSharingActive(true);
          
          return;
        }
        
        // Handle camera tracks for LiveShare
        if (publication.source === Track.Source.Camera) {
          console.log('✅ [LiveShare] Camera track subscribed from:', participant.identity);
          
          const cameraStream = new MediaStream([track.mediaStreamTrack]);
          
          // Check if host also has screen share track
          const screenTrackPub = participant.getTrackPublication(Track.Source.ScreenShare);
          let screenStream = null;
          
          if (screenTrackPub && screenTrackPub.track) {
            screenStream = new MediaStream([screenTrackPub.track.mediaStreamTrack]);
            console.log('🖥️ [LiveShare] Host screen share track also available');
          }
          
          console.log('🎬 [LiveShare] Member displaying camera');
          console.log('📹 Camera stream ready:', cameraStream);
          console.log('🎥 Screen stream ready:', screenStream);
          
          // ✅ Set currentMedia with both streams so CinemaVideoPlayer can render split-view
          if (screenStream) {
            setCurrentMedia({ 
              type: 'liveshare', 
              title: 'LiveShare',
              stream: screenStream,
              cameraStream: cameraStream
            });
            setIsPlaying(true);
            setIsScreenSharingActive(true);
          }
          
          return;
        }
      }
    };

    const handleTrackUnsubscribed = (track, publication, participant) => {
      console.log('📤 [VideoWatch] Remote track unsubscribed:', {
        participant: participant.identity,
        source: publication.source,
        kind: track.kind
      });
      
      // ✅ CLEANUP: Remove audio element when track unsubscribes
      if (track.kind === 'audio') {
        const key = `${participant.sid}-audio`;
        const audioElement = audioElements.get(key);
        
        if (audioElement) {
          console.log('🧹 [VideoWatch] Removing audio element for', participant.identity);
          audioElement.pause();
          audioElement.srcObject = null;
          audioElement.remove();
          audioElements.delete(key);
        }
      }
      
      // ✅ VIDEO CLEANUP: LiveKit handles UI updates automatically
      if (track.kind === 'video') {
        console.log('📹 [VideoWatch] Video track unsubscribed:', {
          source: publication.source,
          participant: participant.identity
        });
      }
    };
    
    // ✅ Store participant-level listeners for cleanup
    const participantListeners = new Map(); // participant.identity -> handler function
    
    // ✅ SHARED: Single TrackPublished handler for ALL participants
    const handleParticipantTrackPublished = (participant) => (publication) => {
      console.log(`📢 [VideoWatch] ${participant.identity} published new track:`, {
        kind: publication.kind,
        source: publication.source,
        trackSid: publication.trackSid
      });
      
      if (publication.kind === 'video') {
        console.log('📹 [VideoWatch] New video track published - auto-subscribing');
        publication.setSubscribed(true);
      }
    };
    
    // ✅ Handle when remote participant connects (check for existing tracks)
    const handleParticipantConnected = (participant) => {
      console.log('👤 [VideoWatch] Participant connected:', participant.identity);
      console.log('📹 [VideoWatch] Participant track publications:', {
        audio: participant.audioTrackPublications.size,
        video: participant.videoTrackPublications.size
      });
      
      // Check for video tracks that might already be published
      participant.videoTrackPublications.forEach((publication) => {
        console.log('📹 [VideoWatch] Found video publication on connect:', {
          trackSid: publication.trackSid,
          source: publication.source,
          isSubscribed: publication.isSubscribed,
          hasTrack: !!publication.track
        });
        
        if (!publication.isSubscribed && publication.kind === 'video') {
          console.log('📹 [VideoWatch] Auto-subscribing to video track');
          publication.setSubscribed(true);
        }
      });
      
      // ✅ CRITICAL: Listen for NEW tracks published by this participant
      const handler = handleParticipantTrackPublished(participant);
      participantListeners.set(participant.identity, handler);
      participant.on(ParticipantEvent.TrackPublished, handler);
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    
    // ✅ CRITICAL: Also listen on ALREADY CONNECTED participants (member was already in room when host publishes)
    room.remoteParticipants.forEach((participant) => {
      console.log(`🔗 [VideoWatch] Registering TrackPublished listener for existing participant: ${participant.identity}`);
      
      const handler = handleParticipantTrackPublished(participant);
      participantListeners.set(participant.identity, handler);
      participant.on(ParticipantEvent.TrackPublished, handler);
    });

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      
      // ✅ CLEANUP: Remove all participant-level TrackPublished listeners
      room.remoteParticipants.forEach((participant) => {
        const handler = participantListeners.get(participant.identity);
        if (handler) {
          participant.off(ParticipantEvent.TrackPublished, handler);
          console.log(`🧹 [VideoWatch] Removed TrackPublished listener for ${participant.identity}`);
        }
      });
      participantListeners.clear();
      
      // Cleanup all audio elements on unmount
      audioElements.forEach((audioElement, key) => {
        console.log('🧹 [VideoWatch] Cleanup: Removing audio element', key);
        audioElement.pause();
        audioElement.srcObject = null;
        audioElement.remove();
      });
      audioElements.clear();
    };
  }, [room]);

  // ✅ Track speaking state and audio levels from LiveKit using activeSpeakersChanged
  useEffect(() => {
    if (!room) {
      console.log('⚠️ [LiveKit Audio] No room - skipping audio tracking');
      return;
    }

    console.log('🎤 [LiveKit Audio] Setting up activeSpeakersChanged listener');

    /**
     * Track ALL active speakers in the room (fires when speaker list changes)
     * Updates remoteAudioStates with real-time audio levels for dynamic waveform animation
     */
    const handleActiveSpeakersChanged = (speakers) => {
      // Build new state: { userId: { isSpeaking: true, audioLevel: 0-255 } }
      const newAudioStates = {};
      
      speakers.forEach((speaker) => {
        // Parse userId from identity (format: "user-123" or "user-123-abc")
        const identityParts = speaker.identity.split('-');
        const speakerUserId = identityParts[1]; // Extract user ID
        
        const audioLevel = speaker.audioLevel || 0; // 0-1 float from LiveKit
        const normalizedLevel = Math.round(audioLevel * 255); // Convert to 0-255 for waveform
        
        newAudioStates[speakerUserId] = {
          isSpeaking: true,
          audioLevel: normalizedLevel,
        };
        
        console.log(`🎧 [Audio State] User ${speakerUserId}: audioLevel=${normalizedLevel}/255 (${Math.round(audioLevel * 100)}%)`);
      });
      
      // Update state: reset all to silent, then override with active speakers
      setRemoteAudioStates(prev => {
        const next = {};
        
        // Reset all existing users to silent
        Object.keys(prev).forEach(userId => {
          next[userId] = { 
            ...prev[userId], 
            isSpeaking: false, 
            audioLevel: 0 
          };
        });
        
        // Add active speakers (overrides silent state)
        Object.keys(newAudioStates).forEach(userId => {
          next[userId] = {
            ...prev[userId], // Preserve isMuted from WebSocket
            ...newAudioStates[userId]
          };
        });
        
        console.log('🔊 [remoteAudioStates] Updated state:', next);
        return next;
      });
      
      // Log only when there are active speakers (reduce console noise)
      if (speakers.length > 0) {
        console.log(`🎤 [Active Speakers] ${speakers.length} speaking:`,
          speakers.map(s => {
            const userId = s.identity.split('-')[1];
            return `User ${userId} (${Math.round(s.audioLevel * 100)}%)`;
          }).join(', ')
        );
      }
    };

    // Register room-level speaker tracking
    room.on('activeSpeakersChanged', handleActiveSpeakersChanged);
    console.log('✅ [LiveKit Audio] activeSpeakersChanged listener registered');

    // Cleanup
    return () => {
      console.log('🧹 [LiveKit Audio] Cleaning up activeSpeakersChanged listener');
      room.off('activeSpeakersChanged', handleActiveSpeakersChanged);
    };
  }, [room]);

  // ✅ MEMBER: Explicitly subscribe to video tracks (screen share, camera)
  useEffect(() => {
    if (!room) return;
    
    // ✅ Track timing for debugging LiveKit Cloud delays
    const subscriptionStartTime = Date.now();
    console.log(`⏱️ [VideoWatch] Video subscription initialized at ${new Date().toISOString()}`);
    
    // 🔍 DEBUG: Track which tracks have been detected by which method
    const detectedTracks = new Map(); // trackSid -> { method: string, timestamp: number }

    const handleTrackPublished = (publication, participant) => {
      const detectionTime = Date.now();
      const delay = detectionTime - subscriptionStartTime;
      
      if (publication.kind === 'video') {
        // 🔍 DEBUG: Record detection via RoomEvent
        const trackKey = `${participant.identity}-${publication.trackSid}`;
        if (detectedTracks.has(trackKey)) {
          const previous = detectedTracks.get(trackKey);
          console.warn(`⚠️ [DEBUG] Track ${publication.trackSid} detected AGAIN via RoomEvent.TrackPublished!`, {
            previousMethod: previous.method,
            previousDelay: previous.delay,
            currentDelay: delay,
            timeDiff: delay - previous.delay
          });
        } else {
          detectedTracks.set(trackKey, { method: 'RoomEvent.TrackPublished', delay, timestamp: detectionTime });
        }
        
        console.log(`🎬 [VideoWatch MEMBER] Video track detected via RoomEvent.TrackPublished! (${delay}ms after init)`, {
          trackSid: publication.trackSid,
          source: publication.source,
          participant: participant.identity,
          timestamp: new Date().toISOString(),
          isFirstDetection: !detectedTracks.has(trackKey)
        });
        publication.setSubscribed(true);
      }
    };

    // ✅ Check existing tracks (less verbose)
    const hasExistingVideo = Array.from(room.remoteParticipants.values())
      .some(p => p.videoTrackPublications.size > 0);
    
    if (hasExistingVideo) {
      console.log('📹 [VideoWatch] Found existing video tracks on mount, subscribing...');
      room.remoteParticipants.forEach((participant) => {
        participant.videoTrackPublications.forEach((publication) => {
          if (!publication.isSubscribed && publication.kind === 'video') {
            const trackKey = `${participant.identity}-${publication.trackSid}`;
            detectedTracks.set(trackKey, { 
              method: 'Mount Check', 
              delay: 0, 
              timestamp: Date.now() 
            });
            console.log(`✅ Subscribing to ${publication.source} from ${participant.identity} (found on mount)`);
            publication.setSubscribed(true);
          }
        });
      });
    }

    // Listen for new track publications
    room.on(RoomEvent.TrackPublished, handleTrackPublished);

    // ✅ OPTIMIZED POLLING: Check every 500ms (4x faster than before)
    let lastPollLogTime = Date.now();
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      
      room.remoteParticipants.forEach((participant) => {
        const videoTrackCount = participant.videoTrackPublications.size;
        
        participant.videoTrackPublications.forEach((publication) => {
          if (!publication.isSubscribed && publication.kind === 'video') {
            const detectionTime = Date.now();
            const delay = detectionTime - subscriptionStartTime;
            const trackKey = `${participant.identity}-${publication.trackSid}`;
            
            // 🔍 DEBUG: Check if this track was detected by events first
            if (detectedTracks.has(trackKey)) {
              const previous = detectedTracks.get(trackKey);
              console.warn(`⚠️ [DEBUG] Track ${publication.trackSid} found UNSUBSCRIBED by polling after ${previous.method} detected it!`, {
                eventMethod: previous.method,
                eventDelay: previous.delay,
                pollingDelay: delay,
                timeSinceEvent: delay - previous.delay,
                wasSubscribed: 'Event called setSubscribed(true) but track still unsubscribed!'
              });
            } else {
              detectedTracks.set(trackKey, { method: 'Polling', delay, timestamp: detectionTime });
              console.log(`🔄 [VideoWatch POLL #${pollCount}] Found unsubscribed video track! (${delay}ms delay)`, {
                trackSid: publication.trackSid,
                source: publication.source,
                participant: participant.identity,
                timestamp: new Date().toISOString(),
                detectionMethod: 'POLLING_ONLY (no event fired)'
              });
            }
            
            publication.setSubscribed(true);
          }
        });
        
        // Log polling status every 10 seconds if no tracks found
        if (videoTrackCount === 0 && Date.now() - lastPollLogTime > 10000) {
          console.log(`� [VideoWatch POLL #${pollCount}] No video tracks yet from ${participant.identity} (${Math.round((Date.now() - subscriptionStartTime) / 1000)}s elapsed, ${pollCount * 500}ms total polling time)`);
          lastPollLogTime = Date.now();
        }
      });
    }, 500); // ✅ 500ms = 4x faster detection

    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished);
      clearInterval(pollInterval);
      console.log(`🔍 [DEBUG] Video subscription cleanup - Detected ${detectedTracks.size} tracks total`);
      detectedTracks.forEach((info, trackKey) => {
        console.log(`  📊 ${trackKey}: ${info.method} at ${info.delay}ms`);
      });
    };
  }, [room]);

  // 📝 QUIZ SYSTEM: WebSocket Message Handlers
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) return;

    try {
      const messageData = typeof latestMessage === 'string' 
        ? JSON.parse(latestMessage) 
        : latestMessage;

      // ✅ Handle quiz_created - Host receives confirmation
      if (messageData.type === 'quiz_created') {
        console.log('📝 [VideoWatch] Quiz created:', messageData.data);
        toast.success(`Quiz "${messageData.data.name}" created successfully!`);
        
        // Add to quizzes list
        setQuizzes(prev => [...prev, messageData.data]);
      }

      // ✅ Handle quiz_published - All users receive notification
      if (messageData.type === 'quiz_published') {
        console.log('📝 [VideoWatch] Quiz published:', messageData.data);
        
        const quizInfo = messageData.data;
        setActiveQuiz(quizInfo);
        
        // Show notification to students
        if (!isHost) {
          toast.success(`📝 New quiz available: ${quizInfo.name}`, {
            duration: 5000,
            icon: '📝'
          });
          
          // Auto-open quiz modal for students
          setTimeout(() => {
            handleRequestQuiz(quizInfo.quiz_id);
          }, 1000);
        } else {
          toast.success(`Quiz "${quizInfo.name}" published to all students!`);
        }
      }

      // ✅ Handle quiz_data - Student receives quiz questions
      if (messageData.type === 'quiz_data') {
        console.log('📝 [VideoWatch] Received quiz data:', messageData.data);
        setCurrentQuizData(messageData.data);
        setIsTakeQuizOpen(true);
      }

      // ✅ Handle quiz_results - Student receives graded results
      if (messageData.type === 'quiz_results') {
        console.log('📝 [VideoWatch] Received quiz results:', messageData.data);
        setQuizResults(messageData.data);
        setIsTakeQuizOpen(false);
        setIsQuizResultsOpen(true);
        
        // Show score notification
        const percentage = ((messageData.data.score / messageData.data.total) * 100).toFixed(1);
        toast.success(`Quiz submitted! Score: ${messageData.data.score}/${messageData.data.total} (${percentage}%)`, {
          duration: 6000
        });
      }

      // ✅ Handle quiz_submission_received - Host receives notification
      if (messageData.type === 'quiz_submission_received') {
        console.log('📝 [VideoWatch] Student submitted quiz:', messageData.data);
        
        if (isHost) {
          toast.success(`${messageData.data.username} submitted the quiz! Score: ${messageData.data.score}/${messageData.data.total}`, {
            duration: 4000,
            icon: '✅'
          });
        }
      }

      // ✅ Handle quiz_ended - All users receive notification
      if (messageData.type === 'quiz_ended') {
        console.log('📝 [VideoWatch] Quiz ended:', messageData.data);
        
        setActiveQuiz(null);
        setIsTakeQuizOpen(false);
        
        toast.success('Quiz has ended', {
          duration: 3000
        });
        
        if (isHost) {
          toast.success(`Total submissions: ${messageData.data.total_submissions}, Avg score: ${messageData.data.average_score?.toFixed(1)}`, {
            duration: 5000
          });
        }
      }

      // ✅ Handle quiz_error
      if (messageData.type === 'quiz_error') {
        console.error('❌ [VideoWatch] Quiz error:', messageData.data);
        toast.error(messageData.data.message || 'Quiz error occurred');
      }

      // 🎮 Handle game_started
      if (messageData.type === 'game_started') {
        console.log('🎮 [VideoWatch] Game started:', messageData.data);
        setActiveGame(messageData.data);
        toast.success(`${messageData.data.game_type.replace('_', ' ').toUpperCase()} started!`, {
          duration: 3000,
          icon: '🎮'
        });
      }

      // 🎮 Handle game_state_update
      if (messageData.type === 'game_state_update') {
        console.log('🎮 [VideoWatch] Game state updated:', messageData.data);
        setActiveGame(messageData.data);
      }

      // 🎮 Handle game_ended
      if (messageData.type === 'game_ended') {
        console.log('🎮 [VideoWatch] Game ended:', messageData.data);
        const winner = messageData.data.players?.find(p => p.score > 0);
        if (winner) {
          toast.success(`${winner.username} wins!`, {
            duration: 4000,
            icon: '🏆'
          });
        } else {
          toast.success("It's a draw!", {
            duration: 3000,
            icon: '🤝'
          });
        }
        setActiveGame(null);
      }

      // 🎮 Handle game_forfeited
      if (messageData.type === 'game_forfeited') {
        console.log('🎮 [VideoWatch] Game forfeited:', messageData.data);
        toast(`${messageData.data.username} forfeited. ${messageData.data.winner_username} wins!`, {
          duration: 4000,
          icon: '🏆'
        });
        setActiveGame(null);
      }

      // 🎮 Handle game_error
      if (messageData.type === 'game_error') {
        console.error('❌ [VideoWatch] Game error:', messageData.data);
        toast.error(messageData.data.message || 'Game error occurred');
      }

    } catch (error) {
      console.error('❌ [VideoWatch] Error processing quiz message:', error);
    }
  }, [messages, isHost]);

  

  // 🎤 Enumerate audio devices on mount
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        // ✅ Request microphone permission first to get device labels
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          stream.getTracks().forEach(track => track.stop()); // Stop the temporary permission stream
        });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        setAudioDevices(audioInputs);
        
        // Set default device if none selected
        if (!selectedAudioDeviceId && audioInputs.length > 0) {
          // Prefer non-default devices (avoid "Default" which browser auto-switches)
          const preferredDevice = audioInputs.find(d => !d.label.toLowerCase().includes('default')) || audioInputs[0];
          setSelectedAudioDeviceId(preferredDevice.deviceId);
          console.log('🎤 [VideoWatch] Default audio device selected:', preferredDevice.label, preferredDevice.deviceId);
        }
        
        console.log('🎤 [VideoWatch] Available audio devices:', audioInputs.map(d => ({ label: d.label, id: d.deviceId })));
      } catch (err) {
        console.error('❌ [VideoWatch] Failed to enumerate devices:', err);
        // Fallback: Try without permission (will get generic labels)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter(d => d.kind === 'audioinput');
          setAudioDevices(audioInputs);
          if (!selectedAudioDeviceId && audioInputs.length > 0) {
            setSelectedAudioDeviceId(audioInputs[0].deviceId);
            console.log('🎤 [VideoWatch] Fallback: Selected first audio device');
          }
        } catch (fallbackErr) {
          console.error('❌ [VideoWatch] Fallback device enumeration failed:', fallbackErr);
        }
      }
    };

    enumerateDevices();
    
    // Listen for device changes (e.g., headset plugged in)
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
  }, [selectedAudioDeviceId]);

  useEffect(() => {
    return () => {
      if (localParticipant) {
        localParticipant.setScreenShareEnabled(false);
      }
      disconnectLiveKit();
    };
  }, []);

  // 🎤 Publish audio track to LiveKit (keeps track published, toggles enabled state)
  // This is REQUIRED for activeSpeakersChanged to work - LiveKit needs a published track
  useEffect(() => {
    if (!localParticipant) {
      console.log('⏳ [VideoWatch Audio] Waiting for localParticipant');
      return;
    }
    
    if (!selectedAudioDeviceId) {
      console.log('⏳ [VideoWatch Audio] Waiting for audio device selection');
      return;
    }

    const publishAudioTrack = async () => {
      try {
        console.log('🎤 [VideoWatch Audio] Publishing audio track to LiveKit');
        console.log('   Device:', selectedAudioDeviceId);
        
        // ✅ Create audio track with selected device
        const constraints = {
          deviceId: { exact: selectedAudioDeviceId },
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        };
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        const audioTrack = stream.getAudioTracks()[0];
        
        if (!audioTrack) {
          throw new Error('No audio track obtained from getUserMedia');
        }
        
        console.log('🎤 [VideoWatch Audio] Got audio track from device:', audioTrack.label);
        
        // ✅ Publish to LiveKit first
        const publication = await localParticipant.publishTrack(audioTrack, {
          source: 'microphone',
          name: 'microphone',
        });
        
        // ✅ Set track to disabled (muted) AFTER publishing
        // LiveKit's publishTrack() enables tracks by default, so we must disable after
        audioTrack.enabled = false;
        
        publishedAudioTrackRef.current = audioTrack;
        setHasMicPermission(true);
        setIsAudioActive(false); // Start muted
        
        console.log('✅ [VideoWatch Audio] Audio track published to LiveKit');
        console.log('   Track ID:', audioTrack.id);
        console.log('   Track label:', audioTrack.label);
        console.log('   Track enabled:', audioTrack.enabled);
        console.log('   Publication SID:', publication.trackSid);
        
      } catch (err) {
        console.error('❌ [VideoWatch Audio] Failed to publish audio track:', err);
        console.error('   Error name:', err.name);
        console.error('   Error message:', err.message);
        setHasMicPermission(false);
        
        // Show user-friendly error
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          alert('Microphone permission denied. Please allow microphone access to unmute.');
        } else if (err.name === 'NotFoundError') {
          alert('No microphone found. Please connect a microphone.');
        } else {
          alert(`Microphone error: ${err.message}`);
        }
      }
    };

    publishAudioTrack();
    
    // Cleanup: unpublish on unmount
    return () => {
      if (publishedAudioTrackRef.current) {
        console.log('🧹 [VideoWatch Audio] Unpublishing audio track');
        localParticipant.unpublishTrack(publishedAudioTrackRef.current)
          .catch(err => console.warn('⚠️ Unpublish error:', err));
        publishedAudioTrackRef.current.stop();
        publishedAudioTrackRef.current = null;
      }
    };
  }, [localParticipant, selectedAudioDeviceId]);

  // 📹 Binary WebSocket handler for receiving camera streams
  useEffect(() => {
    if (!setBinaryMessageHandler) return;

    const handleBinaryMessage = (data) => {
      console.log('📹 [VideoWatch] Binary data received:', data.byteLength, 'bytes');
      console.log('📹 [VideoWatch] Active camera sources:', Object.keys(remoteCameraSourcesRef.current));
      
      // Find active camera users and append to their SourceBuffer
      Object.entries(remoteCameraSourcesRef.current).forEach(([userId, source]) => {
        console.log(`📹 [VideoWatch] Checking user ${userId}:`, {
          hasSourceBuffer: !!source.sourceBuffer,
          isUpdating: source.sourceBuffer?.updating,
          readyState: source.mediaSource?.readyState
        });
        
        if (source.sourceBuffer && !source.sourceBuffer.updating) {
          try {
            source.sourceBuffer.appendBuffer(data);
            console.log(`✅ [VideoWatch] Appended ${data.byteLength} bytes to user ${userId}'s camera buffer`);
          } catch (err) {
            console.error(`❌ [VideoWatch] Failed to append buffer for user ${userId}:`, err);
          }
        } else {
          console.warn(`⚠️ [VideoWatch] Skipping user ${userId} - buffer updating or not ready`);
        }
      });
    };

    setBinaryMessageHandler(handleBinaryMessage);
    console.log('✅ [VideoWatch] Binary message handler registered');
    
    return () => {
      setBinaryMessageHandler(null);
    };
  }, [setBinaryMessageHandler]);

  // Camera toggle - Use LiveKit instead of WebSocket binary
  const toggleCamera = async () => {
    console.log('📹 [toggleCamera] Called. isCameraOn:', isCameraOn, 'localParticipant:', !!localParticipant, 'room:', !!room);
    
    if (!isCameraOn) {
      try {
        if (!localParticipant) {
          console.error('❌ [toggleCamera] localParticipant is null!');
          alert('Not connected to LiveKit. Please wait...');
          return;
        }

        console.log('📹 [toggleCamera] Enumerating camera devices...');
        // 1. Get available cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log('📹 [toggleCamera] Found', videoDevices.length, 'camera(s):', videoDevices.map(d => d.label || d.deviceId));
        setAvailableCameras(videoDevices);
        
        // 2. Use first camera by default (or previously selected)
        const cameraId = selectedCameraId || videoDevices[0]?.deviceId;
        if (!cameraId) {
          console.error('❌ [toggleCamera] No camera deviceId found!');
          alert('No camera found!');
          return;
        }
        
        console.log('📹 [toggleCamera] Enabling camera via LiveKit with deviceId:', cameraId);
        // 3. Enable camera via LiveKit
        const track = await localParticipant.setCameraEnabled(true, { deviceId: cameraId });
        console.log('✅ [toggleCamera] LiveKit camera enabled. Track:', track);
        
        // 4. Extract MediaStream from LiveKit track for preview
        if (track && track.videoTrack) {
          const mediaStream = new MediaStream([track.videoTrack.mediaStreamTrack]);
          setCameraPreviewStream(mediaStream);
          console.log('✅ [toggleCamera] Set cameraPreviewStream from LiveKit track');
        }
        
        setIsCameraOn(true);
        setSelectedCameraId(cameraId);
        
        console.log('✅ [VideoWatch] Camera enabled via LiveKit');
        
        // 4. Notify other users via WebSocket
        sendMessage({
          type: 'camera_started',
          user_id: currentUser?.id
        });
      } catch (error) {
        console.error('❌ [toggleCamera] Failed to start camera:', error);
        alert('Failed to start camera: ' + error.message);
      }
    } else {
      console.log('📹 [toggleCamera] Disabling camera...');
      // Stop camera via LiveKit
      if (localParticipant) {
        await localParticipant.setCameraEnabled(false);
        console.log('✅ [toggleCamera] LiveKit camera disabled');
      }
      
      // Clear preview stream
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(track => track.stop());
      }
      setCameraPreviewStream(null);
      
      setIsCameraOn(false);
      setAvailableCameras([]);
      
      console.log('🛑 [VideoWatch] Camera disabled via LiveKit');
      
      // Notify other users
      sendMessage({
        type: 'camera_stopped',
        user_id: currentUser?.id
      });
    }
  };

  // Switch camera device - Use LiveKit
  const switchCamera = async (deviceId) => {
    if (!localParticipant) return;
    
    try {
      await localParticipant.switchActiveDevice('videoinput', deviceId);
      setSelectedCameraId(deviceId);
      console.log('✅ [VideoWatch] Switched to camera:', deviceId);
    } catch (err) {
      console.error('❌ Failed to switch camera:', err);
    }
  };

  // 📝 QUIZ SYSTEM: Handler Functions
  const handleQuizClick = useCallback(() => {
    if (isHost) {
      setIsQuizManagementOpen(true);
    } else {
      // Student clicks quiz button - show active quiz if available
      if (activeQuiz) {
        handleRequestQuiz(activeQuiz.quiz_id);
      } else {
        toast.error('No active quiz available');
      }
    }
  }, [isHost, activeQuiz]);

  const handleRequestQuiz = useCallback((quizId) => {
    if (!sendMessage) {
      console.error('❌ [VideoWatch] sendMessage not available');
      return;
    }
    
    sendMessage({
      type: 'quiz_request',
      data: { quiz_id: quizId }
    });
  }, [sendMessage]);

  const handleCreateQuiz = useCallback(() => {
    setIsQuizManagementOpen(false);
    setIsMakeQuizOpen(true);
  }, []);

  const handleViewResults = useCallback((quizId) => {
    // TODO: Fetch quiz results from backend
    console.log('📊 View results for quiz:', quizId);
    toast('Results view coming soon!');
  }, []);

  // 🎮 GAME SYSTEM: Handler Functions
  const handleGameClick = useCallback(() => {
    if (isHost) {
      setIsGameLobbyOpen(true);
    } else {
      toast('Only the host can start games');
    }
  }, [isHost]);

  const handleStartGame = useCallback((gameType, playersData) => {
    if (!sendMessage) {
      console.error('❌ [VideoWatch] sendMessage not available');
      return;
    }
    
    console.log('🎮 [VideoWatch] Starting game:', gameType, playersData);
    
    sendMessage({
      type: 'start_game',
      data: {
        game_type: gameType,
        players: playersData
      }
    });
    
    setIsGameLobbyOpen(false);
  }, [sendMessage]);

  const handleGameMove = useCallback((moveData) => {
    if (!sendMessage) {
      console.error('❌ [VideoWatch] sendMessage not available');
      return;
    }
    
    console.log('🎮 [VideoWatch] Making move:', moveData);
    
    sendMessage({
      type: 'make_move',
      data: moveData
    });
  }, [sendMessage]);

  const handleGameClose = useCallback(() => {
    console.log('🎮 [VideoWatch] Closing game');
    setActiveGame(null);
  }, []);

  // Define stable callbacks
  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleError = useCallback((err) => {
    if (!currentMedia) return;
    
    // Ignore benign errors that happen during normal playback
    const errorMessage = err?.message || err?.toString() || '';
    const isBenignError = 
      errorMessage.includes('interrupted by a call to pause') ||
      errorMessage.includes('aborted by the user agent') ||
      errorMessage.includes('Load of media resource') ||
      !currentMedia?.mediaUrl; // No media source set yet
    
    if (isBenignError) {
      console.warn("⚠️ [VideoWatch] Benign video error (ignoring):", errorMessage);
      return;
    }
    
    console.error("🎬 CinemaVideoPlayer: Error:", err);
    alert("❌ Failed to play video.");
  }, [currentMedia]);

  const handlePauseBroadcast = useCallback(() => {
    if (isHost && isConnected && currentMedia) {
      sendMessage({
        type: "playback_control",
        command: "play",
        media_item_id: id,
        file_path: filePath,
        file_url: normalizedMediaItem.mediaUrl, // ✅ Add this
        original_name: normalizedMediaItem.original_name,
        seek_time: 0,
        timestamp: Date.now(),
        sender_id: currentUser.id,
      });
    }
  }, [isHost, isConnected, currentMedia, sendMessage]);

  // ⏰ Callback to update playback position from video player
  const handleTimeUpdate = useCallback((currentTime) => {
    playbackPositionRef.current = currentTime;
  }, []);

  // PLATFORMS list (unchanged)
  const PLATFORMS = [
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com    ' },
    { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv    ' },
    { id: 'crunchyroll', name: 'Crunchyroll', url: 'https://www.crunchyroll.com    ' },
    { id: 'hdtoday', name: 'HDToday', url: 'https://hdtoday.cc/    ' },
    { id: 'moviebox', name: 'MovieBox', url: 'https://moviebox.ph/    ' },
    { id: 'viki', name: 'Viki', url: 'https://www.viki.com    ' },
    { id: 'tubi', name: 'Tubi', url: 'https://tubitv.com    ' },
    { id: 'vimeo', name: 'Vimeo', url: 'https://vimeo.com    ' },
    { id: 'plutotv', name: 'Pluto TV', url: 'https://pluto.tv    ' },
    { id: 'irokotv', name: 'IrokoTV', url: 'https://irokotv.com    ' },
    { id: 'showmax', name: 'Showmax', url: 'https://www.showmax.com    ' },
    { id: 'africamagic', name: 'Africa Magic', url: 'https://www.youtube.com/@AfricaMagic    ' },
  ];

  // Handle chat modal
  const openChat = () => {
    setShowChatHome(true);
  };

  // 🎯 Apply pending seek time when video loads (for late joiner sync)
  useEffect(() => {
    const video = videoPlayerRef.current;
    // Skip for LiveShare streams (both host mode and member viewing)
    if (!video || !currentMedia || liveShareMode || liveShareContentMode) return;

    const handleLoadedData = () => {
      const t0 = Date.now();
      console.log(`⏱️ [MEMBER] loadeddata fired`, {
        readyState: video.readyState,
        currentTime: video.currentTime,
        isPlaying,
        pendingSeekTime,
        t: t0,
      });

      // Option 3: after the full load+seek pipeline, jump ahead by the total elapsed time
      // so the member's position matches the host instead of being pipeline-delay behind.
      const doPlay = () => {
        if (!isPlaying) {
          console.log(`⏸️ [MEMBER] isPlaying=false — skipping play()`);
          return;
        }
        if (wsArrivalTimeRef.current) {
          const wsElapsed = (Date.now() - wsArrivalTimeRef.current) / 1000;
          const correctedTime = video.currentTime + wsElapsed;
          wsArrivalTimeRef.current = null;
          console.log(`▶️ [MEMBER] Post-play correction +${(wsElapsed * 1000).toFixed(0)}ms → ${correctedTime.toFixed(3)}s`);
          video.currentTime = correctedTime;
          // Wait for this tiny correction seek before calling play()
          const onCorrectionSeeked = () => {
            video.removeEventListener('seeked', onCorrectionSeeked);
            video.play().catch(err => console.error(`❌ [MEMBER] play() failed (${err.name})`));
          };
          video.addEventListener('seeked', onCorrectionSeeked);
        } else {
          console.log(`▶️ [MEMBER] play() — T+${Date.now() - t0}ms since loadeddata`);
          video.play().catch(err => console.error(`❌ [MEMBER] play() failed (${err.name}): ${err.message}`));
        }
      };

      if (pendingSeekTime !== null && pendingSeekTime > 0) {
        // Seek is async: currentTime assignment fires `seeking`, completes at `seeked`.
        // Calling play() before `seeked` causes AbortError and leaves video on first frame.
        // Wait for `seeked` before starting playback.
        console.log(`🔍 [MEMBER] Seeking to ${pendingSeekTime.toFixed(3)}s — deferring play() until seeked`);
        video.currentTime = pendingSeekTime;
        setPendingSeekTime(null);
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          console.log(`✅ [MEMBER] seeked fired — T+${Date.now() - t0}ms since loadeddata`);
          doPlay();
        };
        video.addEventListener('seeked', onSeeked);
      } else {
        console.log(`🎯 [MEMBER] No seek needed (pendingSeekTime=${pendingSeekTime}) — calling play() directly`);
        doPlay();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    return () => video.removeEventListener('loadeddata', handleLoadedData);
  }, [currentMedia, liveShareMode, isPlaying, pendingSeekTime]);

  // Monitor LiveKit local participant for screen share track
  useEffect(() => {
    if (!localParticipant) {
      console.log('🔍 [VideoWatch] No local participant yet');
      return;
    }

    console.log('🔍 [VideoWatch] Monitoring local participant tracks');
    console.log('   localParticipant keys:', Object.keys(localParticipant));
    console.log('   videoTracks:', localParticipant.videoTracks);
    console.log('   videoTrackPublications:', localParticipant.videoTrackPublications);

    const handleTrackPublished = (publication) => {
      console.log('📡 [VideoWatch HOST] LocalParticipant.TrackPublished event!', {
        source: publication.source,
        kind: publication.kind,
        trackSid: publication.trackSid,
        trackName: publication.trackName,
        hasTrack: !!publication.track
      });
      console.log('📡 [VideoWatch HOST] This track should be broadcast to all remote participants');
      
      if (publication.source === Track.Source.ScreenShare) {
        console.log('✅ [VideoWatch] Screen share track detected!');
        if (publication.track) {
          setLocalScreenTrack(publication.track);
        } else {
          console.warn('⚠️ [VideoWatch] Screen share publication has no track yet');
        }
      }
    };

    const handleTrackUnpublished = (publication) => {
      console.log('📡 [VideoWatch] Track unpublished:', publication.source);
      if (publication.source === Track.Source.ScreenShare) {
        console.log('❌ [VideoWatch] Screen share track removed');
        setLocalScreenTrack(null);
      }
    };

    // Listen for track events (use ParticipantEvent constants)
    localParticipant.on(ParticipantEvent.TrackPublished, handleTrackPublished);
    localParticipant.on(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);

    // Check if screen share track already exists
    const trackPubs = localParticipant.videoTrackPublications || localParticipant.videoTracks;
    if (trackPubs) {
      const screenSharePub = Array.from(trackPubs.values()).find(
        pub => pub.source === Track.Source.ScreenShare
      );
      if (screenSharePub?.track) {
        console.log('✅ [VideoWatch] Found existing screen share track');
        setLocalScreenTrack(screenSharePub.track);
      }
    }

    // Cleanup
    return () => {
      localParticipant.off(ParticipantEvent.TrackPublished, handleTrackPublished);
      localParticipant.off(ParticipantEvent.TrackUnpublished, handleTrackUnpublished);
    };
  }, [localParticipant]);

  // Handle Delete Media
  const handleDeleteMedia = async (mediaItem) => {
    // ... (keep your existing logic — unchanged)
    console.log("🗑️ [VideoWatch] handleDeleteMedia called for item:", mediaItem.ID);
    if (!mediaItem?.ID) {
      alert("❌ Error: Invalid media item selected for deletion.");
      return;
    }
    const filePath = mediaItem.file_path || mediaItem.FilePath;
    if (!filePath) {
      alert("❌ This media item is missing its file path and cannot be deleted.");
      return;
    }
    const normalizedMediaItem = {
      ...mediaItem,
      ID: mediaItem.ID,
      type: 'upload',
      file_path: filePath,
      mediaUrl: mediaItem.file_url || `/uploads/temp/${mediaItem.file_name}`, // ✅
      original_name: mediaItem.original_name || mediaItem.OriginalName || 'Unknown Media',
    };
    try {
      await deleteSingleTemporaryMediaItem(roomId, normalizedMediaItem.ID);
      setPlaylist(prev => prev.filter(item => item.ID !== normalizedMediaItem.ID));
      if (currentMedia?.ID === normalizedMediaItem.ID) {
        setCurrentMedia(null);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error("❌ [VideoWatch] Failed to delete media item:", normalizedMediaItem.ID, err);
      alert("❌ Failed to delete media item. Please try again.");
    }
  };
  const onDeleteMedia = handleDeleteMedia;

  // Handle Platform Select
  const handlePlatformSelect = (platform) => {
    setSelectedPlatform(platform.id);
    if (sendMessage && currentUser) {
      sendMessage({
        type: "platform_selected",
        data: { platform_id: platform.id, platform_name: platform.name, platform_url: platform.url, user_id: currentUser.id },
      });
    }
  };

  // Handle Seats Click
  const handleSeatsClick = () => {
    console.log('🪑 [handleSeatsClick] Seats icon clicked');
    console.log('🪑 [handleSeatsClick] Current state:', { 
      isSeatedMode, 
      userSeatsCount: Object.keys(userSeats).length,
      userSeats 
    });
    
    // If seating mode is enabled but no seats assigned yet, trigger auto-assignment
    if (isSeatedMode && Object.keys(userSeats).length === 0) {
      console.log('🪑 [handleSeatsClick] Seating mode is ON but no seats assigned, triggering auto-assignment');
      sendMessage({
        type: 'seating_mode_toggle',
        enabled: true
      });
    }
    setIsSeatsModalOpen(true);
  };

  // Handle Share Room
  const handleShareRoom = () => {
    const sessionId = sessionStatus?.id || urlSessionId;
    if (!sessionId) {
      toast.error('No active session to share.');
      return;
    }
    const url = `${window.location.origin}/watch/${roomId}?session_id=${sessionId}`;
    setShareUrl(url);
    setShowShareModal(true);
  };

  // Show Notification
  const showNotification = useCallback((message, type = 'info', actions = null) => {
    const id = notificationIdRef.current++;
    setNotifications(prev => [...prev, { id, message, type, actions }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  }, []);

  // Auto-join room
  useEffect(() => {
    if (!roomId || !currentUser) return;
    const joinRoomIfNeeded = async () => {
      try {
        // ✅ Fetch room data (includes is_public for Ghost Mode logic)
        const room = await getRoom(roomId);
        setRoomData(room);
        console.log('🏠 [VideoWatch] Room data fetched:', { is_public: room.is_public });
        
        // ✅ Only check membership, don't fetch all members
        // Session members will be populated via session_member_joined WebSocket events
        const members = await getRoomMembers(roomId);
        const memberList = Array.isArray(members) ? members : members?.members || [];
        const isMember = memberList.some(m => m.id === currentUser.id);
        if (!isMember) {
          await apiClient.post(`/api/rooms/${roomId}/join`);
        }
        
        console.log('✅ [VideoWatch] Room membership verified - session members will come from WebSocket');

        // ✅ Fetch active session ID
        const sessionResponse = await apiClient.get(`/api/rooms/${roomId}/active-session`);
        if (sessionResponse.data.session_id) {
          setActiveSessionId(sessionResponse.data.session_id);
          console.log('📋 Active session ID:', sessionResponse.data.session_id);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          navigate('/lobby');
        }
      }
    };
    joinRoomIfNeeded();
  }, [roomId, currentUser]);

  // ✅ Load chat history when session becomes active
  useEffect(() => {
    // Use sessionStatus.id or fallback to URL session_id
    const activeSessionId = sessionStatus?.id || urlSessionId;
    
    if (!roomId || !activeSessionId) return;
    
    const loadChatHistory = async () => {
      setIsChatLoading(true);
      try {
        console.log('💬 [VideoWatch] Loading chat history for session:', activeSessionId);
        const response = await getChatHistory(roomId, activeSessionId);
        const messages = response.messages || [];
        console.log(`💬 [VideoWatch] Loaded ${messages.length} chat messages with reactions:`, messages);
        setSessionChatMessages(messages);
      } catch (error) {
        console.error('❌ [VideoWatch] Failed to load chat history:', error);
      } finally {
        setIsChatLoading(false);
      }
    };

    loadChatHistory();
  }, [roomId, sessionStatus?.id, urlSessionId]);

  // Initialize Seats
  useEffect(() => {
    if (!currentUser) return;
    const newSeats = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        newSeats.push({ id: `${row}-${col}`, row, col, occupied: false, userId: null });
      }
    }
    setSeats(newSeats);
  }, [currentUser]);

  // ✅ HANDLE PLAY MEDIA (UPLOADED FILES)
  const handlePlayMedia = (mediaItem) => {
    const id = mediaItem?.ID || mediaItem?.id || mediaItem?.media_item_id;
    if (!id) {
      alert("❌ Error: Invalid media item selected.");
      return;
    }
    const filePath = mediaItem.file_path || mediaItem.FilePath;
    if (!filePath) {
      alert("❌ This media item is missing its file path and cannot be played.");
      return;
    }
    // Use toAbsUrl so that relative DB paths ("uploads/temp/x.mp4") and
    // absolute CDN paths are both handled — avoids the localhost fallback
    // that was making the URL unreachable on member devices.
    const mediaUrl = toAbsUrl(mediaItem.file_url || filePath) || filePath;

    const normalizedMediaItem = {
      ...mediaItem,
      ID: id,
      type: 'upload',
      file_path: filePath,
      mediaUrl: mediaUrl,
      original_name: mediaItem.original_name || mediaItem.OriginalName || 'Unknown Media',
    };
    setCurrentMedia(normalizedMediaItem);
    setIsPlaying(true);
    playbackPositionRef.current = 0;

    console.log('🎬 [DEBUG handlePlayMedia] Resolved URLs:', {
      raw_file_path: mediaItem.file_path,
      raw_file_url: mediaItem.file_url,
      computed_filePath: filePath,
      computed_mediaUrl: mediaUrl,
      isHost,
      isConnected,
      userId: currentUser?.id,
    });

    if (isHost && isConnected) {
      const playbackMsg = {
        type: "playback_control",
        command: "play",
        media_item_id: id,
        file_path: filePath,
        file_url: mediaUrl, // absolute URL — members use this directly
        original_name: normalizedMediaItem.original_name,
        seek_time: 0,
        timestamp: Date.now(),
        sender_id: currentUser.id,
      };
      console.log('📤 [DEBUG handlePlayMedia] Sending playback_control via WS:', {
        file_path: playbackMsg.file_path,
        file_url: playbackMsg.file_url,
        media_item_id: playbackMsg.media_item_id,
        sender_id: playbackMsg.sender_id,
      });
      sendMessage(playbackMsg);
    } else {
      console.warn('⚠️ [DEBUG handlePlayMedia] NOT sending playback_control — reason:', !isHost ? 'isHost=false' : 'isConnected=false', { isHost, isConnected });
    }
    
    if (isHost && isConnected) {
      sendMessage({
        type: "update_room_status",
        data: {
          currently_playing: normalizedMediaItem.original_name,
          coming_next: '',
          is_screen_sharing: false,
          screen_sharing_user_id: 0,
        }
      });
      
      // ✅ Auto-update session title with media name
      if (sessionStatus?.id) {
        sendMessage({
          type: 'session_title_update',
          data: {
            session_id: sessionStatus.id,
            title: normalizedMediaItem.original_name
          }
        });
      }
    }
  };

  // ⏰ Periodic seek time update for preview generation (every 30 seconds)
  useEffect(() => {
    if (!isHost || !currentMedia || currentMedia.type !== 'upload' || !isPlaying) {
      return;
    }

    const updateInterval = setInterval(() => {
      const currentSeekTime = playbackPositionRef.current;
      // console.log(`⏰ [VideoWatch] Periodic seek time update: ${currentSeekTime}s`);
      
      sendMessage({
        type: "playback_control",
        command: "seek",
        media_item_id: currentMedia.ID || currentMedia.id,
        file_path: currentMedia.file_path,
        file_url: currentMedia.mediaUrl,
        original_name: currentMedia.original_name,
        seek_time: currentSeekTime,
        timestamp: Date.now(),
        sender_id: currentUser?.id,
      });
    }, 30000); // Update every 30 seconds

    return () => clearInterval(updateInterval);
  }, [isHost, currentMedia, isPlaying, sendMessage, currentUser?.id]);

  // ✅ LIVEKIT SCREEN SHARE HANDLERS - LiveShare Mode
  const handleStartLiveShare = async (mode = 'screen', source = 'liveshare') => {
    console.log('🎥 [VideoWatch] handleStartLiveShare called:', {
      mode,
      source,
      isLiveKitConnected,
      hasLocalParticipant: !!localParticipant,
      hasRoom: !!room,
      roomId,
      userId: currentUser?.id
    });
    
    if (!localParticipant || !room) {
      toast.error('LiveKit not connected. Please wait and try again...');
      console.error('❌ [VideoWatch] Cannot start - LiveKit not ready', {
        isConnected: isLiveKitConnected,
        hasParticipant: !!localParticipant,
        hasRoom: !!room
      });
      return;
    }
    
    try {
      console.log(`🎥 [VideoWatch] Starting LiveShare mode: ${mode}, source: ${source}`);
      
      let screenStream = null;
      let cameraStream = null;
      
      // Start screen share
      if (mode === 'screen' || mode === 'both') {
        console.log('🖥️ [VideoWatch] Starting screen share...');
        
        // 📊 Adaptive bitrate: 2-5 Mbps based on network quality
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const effectiveType = connection?.effectiveType || '4g';
        let screenBitrate = 5000000; // Default 5 Mbps for 4G/WiFi
        
        if (effectiveType === '3g') {
          screenBitrate = 3000000; // 3 Mbps for 3G
        } else if (effectiveType === '2g' || effectiveType === 'slow-2g') {
          screenBitrate = 2000000; // 2 Mbps for 2G
        }
        
        console.log(`📶 [VideoWatch] Network: ${effectiveType} - Using ${screenBitrate / 1000000} Mbps for screen share`);
        
        await localParticipant.setScreenShareEnabled(true, {
          audio: true,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
          simulcast: false,
          videoBitrate: screenBitrate // ✅ Adaptive 2-5 Mbps based on network
        });
        
        // ✅ Get track publication immediately
        const screenTrackPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (screenTrackPub && screenTrackPub.track) {
          screenStream = new MediaStream([screenTrackPub.track.mediaStreamTrack]);
          screenShareTrackRef.current = screenTrackPub.track;
          setScreenShareTrackSid(screenTrackPub.trackSid);
          setLocalScreenTrack(screenTrackPub);
          console.log('✅ [VideoWatch] Screen track acquired:', screenTrackPub.trackSid);
          
          // ✅ CREATE FRESH VIDEO ELEMENT for screen share
          const screenVideo = document.createElement('video');
          screenVideo.srcObject = screenStream;
          screenVideo.autoplay = true;
          screenVideo.playsInline = true;
          screenVideo.muted = false; // Don't mute screen share (may have tab audio)
          screenVideo.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
          document.body.appendChild(screenVideo);
          
          // Store in LiveShare ref
          liveShareVideoRef.current = screenVideo;
          
          screenVideo.play().catch(e => console.warn('⚠️ [VideoWatch] Screen play failed:', e));
          
          console.log('✅ [VideoWatch] Fresh screen video element created');
        } else {
          throw new Error('Screen share track not available');
        }
      }
      
      // Start camera share
      if (mode === 'camera' || mode === 'both') {
        console.log('📹 [VideoWatch] Starting camera...');
        
        // Stop existing camera track if present
        if (cameraShareTrackRef.current) {
          console.log('🧹 [VideoWatch] Cleaning up existing camera track');
          try {
            await localParticipant.unpublishTrack(cameraShareTrackRef.current);
            cameraShareTrackRef.current.stop();
          } catch (cleanupErr) {
            console.warn('⚠️ [VideoWatch] Camera cleanup warning:', cleanupErr);
          }
          cameraShareTrackRef.current = null;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Get camera stream
        const cameraDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = cameraDevices.filter(d => d.kind === 'videoinput');
        
        if (videoDevices.length === 0) {
          toast.error('No camera devices found');
          if (mode === 'camera') return;
        } else {
          // Filter out virtual/wireless cameras and prefer built-in ones
          const virtualCameraKeywords = ['virtual', 'obs', 'snap', 's21', 'samsung', 'phone', 'wireless', 'droidcam', 'iriun', 'epoccam'];
          const builtInCameraKeywords = ['integrated', 'built-in', 'facetime', 'front camera', 'back camera', 'hd webcam'];
          
          console.log('📹 [VideoWatch] Available video devices:', videoDevices.map(d => d.label));
          
          // Prioritize built-in cameras, then non-virtual cameras, then fallback to any camera
          let device = videoDevices.find(d => {
            const label = (d.label || '').toLowerCase();
            return builtInCameraKeywords.some(keyword => label.includes(keyword));
          });
          
          if (!device) {
            device = videoDevices.find(d => {
              const label = (d.label || '').toLowerCase();
              return !virtualCameraKeywords.some(keyword => label.includes(keyword));
            });
          }
          
          if (!device) {
            device = videoDevices[0]; // Fallback to first device
          }
          
          console.log('📹 [VideoWatch] Using camera device:', device.label || device.deviceId);
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: device.deviceId ? { ideal: device.deviceId } : true,
              width: { ideal: 1920 }, // ✅ Full HD for crisp camera
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 30 },
              // ✅ Low-latency optimizations
              latency: { ideal: 0 }, // Request lowest possible latency
              aspectRatio: { ideal: 16/9 }
            },
            audio: false
          });
          
          const videoTrack = stream.getVideoTracks()[0];
          const settings = videoTrack.getSettings();
          
          console.log('✅ [VideoWatch] Camera stream acquired:', {
            resolution: `${settings.width}x${settings.height}`,
            frameRate: settings.frameRate,
            deviceId: settings.deviceId?.substring(0, 20),
            label: videoTrack.label,
            aspectRatio: settings.aspectRatio,
            facingMode: settings.facingMode
          });
          
          console.log(`📊 [VideoWatch] Resolution check: ${settings.width}x${settings.height === 1920 ? '🎯 FULL HD (1080p)' : settings.width === 1280 ? '📺 HD (720p)' : settings.width === 640 ? '📱 SD (480p)' : '🔍 Custom'}`);
          
          // Create LocalVideoTrack and publish
          const LocalVideoTrack = (await import('livekit-client')).LocalVideoTrack;
          const localVideoTrack = new LocalVideoTrack(videoTrack);
          
          const publishStartTime = Date.now();
          
          // 📊 Adaptive bitrate: 1.5-3.5 Mbps based on network quality
          const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          const effectiveType = connection?.effectiveType || '4g';
          let cameraBitrate = 3500000; // Default 3.5 Mbps for 4G/WiFi
          
          if (effectiveType === '3g') {
            cameraBitrate = 2500000; // 2.5 Mbps for 3G
          } else if (effectiveType === '2g' || effectiveType === 'slow-2g') {
            cameraBitrate = 1500000; // 1.5 Mbps for 2G
          }
          
          console.log(`📶 [VideoWatch] Network: ${effectiveType} - Using ${cameraBitrate / 1000000} Mbps for camera`);
          
          const cameraPublication = await localParticipant.publishTrack(localVideoTrack, {
            source: Track.Source.Camera, // ✅ Correct source type for camera
            name: 'camera-share',
            simulcast: false, // Disabled for WSL localhost compatibility
            videoEncoding: {
              maxBitrate: cameraBitrate, // ✅ Adaptive 1.5-3.5 Mbps based on network
              maxFramerate: 30
            },
            // ✅ Lower latency settings
            dtx: false, // Disable discontinuous transmission
            red: false, // Disable redundant encoding
            priority: 'high' // High priority for faster delivery
          });
          
          const publishDuration = Date.now() - publishStartTime;
          
          console.log(`✅ [VideoWatch HOST] Camera published (${publishDuration}ms)`, {
            trackSid: cameraPublication.trackSid,
            source: cameraPublication.source,
            remoteParticipants: room.remoteParticipants.size,
            timestamp: new Date().toISOString()
          });
          
          setCameraShareTrackSid(cameraPublication.trackSid);
          
          cameraStream = new MediaStream([localVideoTrack.mediaStreamTrack]);
          cameraShareTrackRef.current = localVideoTrack;
          
          // ✅ CREATE FRESH VIDEO ELEMENT for camera
          const video = document.createElement('video');
          video.srcObject = cameraStream;
          video.autoplay = true;
          video.playsInline = true;
          video.muted = true;
          video.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
          document.body.appendChild(video);
          
          liveShareCameraVideoRef.current = video;
          
          video.play().catch(err => console.warn('⚠️ [VideoWatch] Camera play failed:', err.message));
          
          console.log('✅ [VideoWatch] Fresh camera video element created');
        }
      }
      
      setLiveShareMode(mode);
      setSharingSource(source);

      // Auto-switch sidebar to liveshare tab so upload tab doesn't stay active
      setForceActiveTab('liveshare');
      setTimeout(() => setForceActiveTab(null), 100);

      // ✅ Include streams in currentMedia for CinemaVideoPlayer
      setCurrentMedia({ 
        type: 'liveshare', 
        title: `LiveShare (${mode})`,
        stream: screenStream,
        cameraStream: cameraStream
      });
      setIsPlaying(true);
      setIsScreenSharingActive(true);
      
      sendMessage({
        type: "update_room_status",
        data: {
          is_screen_sharing: true,
          screen_sharing_user_id: currentUser.id,
          currently_playing: `LiveShare (${mode})`,
          liveshare_mode: mode
        }
      });

      // Capture poster + video clip previews so lobby cards update
      const captureSessionId = sessionStatus?.id || urlSessionId;
      if (captureSessionId) {
        const captureFrameForPreview = (videoEl) => {
          if (!videoEl || videoEl.videoWidth === 0) return;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(async (blob) => {
              if (!blob) return;
              const fd = new FormData();
              fd.append('frames', blob, 'frame_0.jpg');
              fd.append('source_type', 'liveshare');
              try {
                await apiClient.post(`/api/sessions/${captureSessionId}/upload-frames`, fd, { headers: { 'Content-Type': undefined } });
              } catch (e) {
                console.warn('⚠️ [LiveShare] Poster upload failed:', e.message);
              }
            }, 'image/jpeg', 0.8);
          } catch (e) {
            console.warn('⚠️ [LiveShare] Frame capture failed:', e.message);
          }
        };

        const recordPreviewClip = (stream) => {
          if (!stream) return;
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : null;
          if (!mimeType) return;
          try {
            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 500_000 });
            const chunks = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = async () => {
              const blob = new Blob(chunks, { type: mimeType });
              if (blob.size < 1000) return;
              const fd = new FormData();
              fd.append('clip', blob, 'preview.webm');
              fd.append('source_type', 'liveshare_clip');
              try {
                await apiClient.post(`/api/sessions/${captureSessionId}/upload-frames`, fd, { headers: { 'Content-Type': undefined } });
              } catch (e) {
                console.warn('⚠️ [LiveShare] Clip upload failed:', e.message);
              }
            };
            recorder.start();
            setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 4000);
          } catch (e) {
            console.warn('⚠️ [LiveShare] MediaRecorder error:', e.message);
          }
        };

        const doCapture = () => {
          if (mode === 'camera' || mode === 'both') {
            captureFrameForPreview(liveShareCameraVideoRef.current);
            const camStream = liveShareCameraVideoRef.current?.srcObject;
            if (camStream) recordPreviewClip(camStream);
          } else if ((mode === 'screen' || mode === 'regular') && screenStream) {
            const sv = document.createElement('video');
            sv.srcObject = screenStream;
            sv.muted = true;
            sv.onloadeddata = () => { captureFrameForPreview(sv); sv.srcObject = null; };
            sv.play().catch(() => {});
            recordPreviewClip(screenStream);
          }
        };

        if (mode === 'camera' || mode === 'both') {
          // 2s: poster (camera needs a moment to render a frame)
          setTimeout(() => captureFrameForPreview(liveShareCameraVideoRef.current), 2000);
          // 3s: clip (slightly after poster so stream is fully live)
          setTimeout(() => {
            const camStream = liveShareCameraVideoRef.current?.srcObject;
            if (camStream) recordPreviewClip(camStream);
          }, 3000);
        } else if (mode === 'screen' || mode === 'regular') {
          if (screenStream) {
            const sv = document.createElement('video');
            sv.srcObject = screenStream;
            sv.muted = true;
            sv.onloadeddata = () => { captureFrameForPreview(sv); sv.srcObject = null; };
            sv.play().catch(() => {});
            // clip: 2s delay for screen stream to stabilise
            setTimeout(() => recordPreviewClip(screenStream), 2000);
          }
        }

        // Periodic refresh: poster + clip every N minutes
        clearInterval(previewIntervalRef.current);
        previewIntervalRef.current = setInterval(doCapture, PREVIEW_INTERVAL);
      }

      toast.success(`LiveShare started: ${mode}`);
    } catch (err) {
      console.error('❌ [VideoWatch] LiveShare error:', err);
      toast.error(`Failed to start ${mode} share`);
      
      // Cleanup on error
      if (localParticipant) {
        await localParticipant.setScreenShareEnabled(false);
        if (cameraShareTrackRef.current) {
          try {
            await localParticipant.unpublishTrack(cameraShareTrackRef.current);
            cameraShareTrackRef.current.stop();
          } catch (cleanupErr) {
            console.error('❌ [VideoWatch] Cleanup error:', cleanupErr);
          }
          cameraShareTrackRef.current = null;
        }
      }
    }
  };
  
  // 📹 Legacy screen share handler (calls new unified handler)
  const handleStartScreenShare = async () => {
    await handleStartLiveShare('screen', 'liveshare');
  };

  const handleEndScreenShare = () => {
    console.log('🛑 [VideoWatch] Ending LiveShare');
    
    // Stop screen share
    if (localParticipant && screenShareTrackRef.current) {
      localParticipant.setScreenShareEnabled(false);
      screenShareTrackRef.current = null;
      setScreenShareTrackSid(null);
      setLocalScreenTrack(null);
    }
    
    // Stop camera share
    if (cameraShareTrackRef.current) {
      localParticipant?.unpublishTrack(cameraShareTrackRef.current);
      cameraShareTrackRef.current.stop();
      cameraShareTrackRef.current = null;
      setCameraShareTrackSid(null);
    }
    
    // ✅ Clean up LiveShare video elements
    if (liveShareVideoRef.current) {
      liveShareVideoRef.current.pause();
      liveShareVideoRef.current.srcObject = null;
      if (document.body.contains(liveShareVideoRef.current)) {
        document.body.removeChild(liveShareVideoRef.current);
      }
      liveShareVideoRef.current = null;
    }
    
    if (liveShareCameraVideoRef.current) {
      liveShareCameraVideoRef.current.pause();
      liveShareCameraVideoRef.current.srcObject = null;
      if (document.body.contains(liveShareCameraVideoRef.current)) {
        document.body.removeChild(liveShareCameraVideoRef.current);
      }
      liveShareCameraVideoRef.current = null;
    }
    
    // ✅ Clear Bible verse and Hymn overlays (Church mode cleanup)
    if (isBibleVerseActive || currentBibleVerse) {
      console.log('📖 [VideoWatch] Clearing Bible verse on End Live');
      sendMessage({
        type: 'bible_verse_update',
        data: { 
          verse: null,
          active: false
        }
      });
      setCurrentBibleVerse(null);
      setIsBibleVerseActive(false);
    }
    
    if (isHymnActive || currentHymn) {
      console.log('🎵 [VideoWatch] Clearing hymn on End Live');
      sendMessage({
        type: 'hymn_update',
        data: {
          hymn: null,
          active: false
        }
      });
      setCurrentHymn(null);
      setCurrentHymnVerse(1);
      setIsHymnActive(false);
    }
    
    clearInterval(previewIntervalRef.current);
    previewIntervalRef.current = null;
    setLiveShareMode(null);
    setSharingSource(null);
    setIsScreenSharingActive(false);
    setCurrentMedia(null);
    setIsPlaying(false);
    
    // ✅ Clear LiveShare layout and content mode when ending live
    setSelectedLiveShareLayout(null);
    setLiveShareContentMode(null);
    setPodcastConfig(null);
    
    // ✅ Clear guest permission - allows host to invite different person
    setHasLiveSharePermission(false);
    console.log('✅ LiveShare layout, mode, and guest permission cleared');
    
    sendMessage({
      type: "update_room_status",
      data: {
        is_screen_sharing: false,
        screen_sharing_user_id: 0,
        currently_playing: "",
        liveshare_mode: null
      }
    });
    
    toast.success('LiveShare ended');
  };
  
  // 🎬 Handle LiveShare type selection (for Regular mode)
  const handleLiveShareTypeSelect = (type, deviceId, layout) => {
    console.log('🎬 [VideoWatch HOST] LiveShare type selected:', type, 'layout:', layout);
    console.log('🎨 [VideoWatch HOST] Setting selectedLiveShareLayout to:', layout);
    console.log('📊 [VideoWatch HOST] Layout tracking:', {
      receivedLayout: layout,
      willSetState: true,
      currentLayout: selectedLiveShareLayout,
      timestamp: new Date().toISOString()
    });
    setSelectedLiveShareLayout(layout);
    handleStartLiveShare(type, 'liveshare');
  };
  
  // 🎙️ Handle LiveShare mode selection (for Podcast/News/Show modes)
  const handleLiveShareModeSelect = (mode, config = null, layout = null, muteAllMembers = false) => {
    console.log('🎙️ [VideoWatch HOST] LiveShare mode selected:', mode, config, 'layout:', layout, 'muteAllMembers:', muteAllMembers);
    console.log('📊 [VideoWatch HOST] Mode select tracking:', {
      mode,
      hasConfig: !!config,
      layout,
      muteAllMembers,
      willBroadcast: !!sendMessage,
      timestamp: new Date().toISOString()
    });
    console.log('🎙️ [VideoWatch] Config breakdown:', {
      hasConfig: !!config,
      title: config?.title,
      logoUrl: config?.logoUrl,
      titleStyle: config?.titleStyle,
      logoStyle: config?.logoStyle,
      guestId: config?.guestId,
      muteAllMembers,
      fullConfig: config
    });
    
    if (mode === null) {
      // End LiveShare
      console.log('🛑 [VideoWatch] Ending LiveShare mode');
      setLiveShareContentMode(null);
      setPodcastConfig(null);
      setBannerState(null); // Clear banner from previous broadcast
      
      // Clear all GraphicsRenderer layers (ticker, lower_third, logo_bug, etc.)
      if (graphicsRendererRef?.current) {
        console.log('🎨 [VideoWatch] Clearing all graphics layers');
        graphicsRendererRef.current.removeLayer('ticker');
        graphicsRendererRef.current.removeLayer('lower_third');
        graphicsRendererRef.current.removeLayer('logo_bug');
        graphicsRendererRef.current.removeLayer('media_queue');
        graphicsRendererRef.current.render();
      }
      
      handleEndScreenShare();
      return;
    }
    
    // Store the content mode (podcast, news, show, regular)
    console.log('📌 [VideoWatch] Setting liveShareContentMode to:', mode);
    setLiveShareContentMode(mode);
    
    // Store layout if provided
    if (layout) {
      console.log('🎨 [VideoWatch HOST] Setting selectedLiveShareLayout to:', layout);
      console.log('📊 [VideoWatch HOST] Layout state update:', {
        previousLayout: selectedLiveShareLayout,
        newLayout: layout,
        willBroadcast: true,
        timestamp: new Date().toISOString()
      });
      setSelectedLiveShareLayout(layout);
    } else {
      console.warn('⚠️ [VideoWatch HOST] No layout provided to handleLiveShareModeSelect');
    }
    
    // Store podcast config for overlay rendering
    if (config) {
      const podcastConfigData = {
        ...config,
        mode: mode, // 'podcast', 'news', or 'show'
        hostUsername: currentUser?.username || 'Host',
        sessionId: activeSessionId
      };
      console.log('📦 [VideoWatch] Setting podcastConfig to:', podcastConfigData);
      setPodcastConfig(podcastConfigData);
      
      // 🔇 Auto-mute all members if requested (podcast/church/news/show modes)
      if (muteAllMembers && isHost) {
        console.log('🔇 [VideoWatch] Auto-muting all members for mode:', mode, 'exemptGuestId:', config.guestId);
        // Use setTimeout to ensure state is ready
        setTimeout(() => {
          handleMuteAll(config.guestId || null);
        }, 100);
      }
    } else {
      console.log('ℹ️ [VideoWatch] No config provided, clearing podcastConfig');
      setPodcastConfig(null);
    }
    
    // 📡 BROADCAST: Send mode selection to all members via WebSocket
    // This triggers backend to save config and broadcast to all viewers
    if (sendMessage) {
      const broadcastData = {
        type: 'liveshare_mode_selected',
        mode: mode,
      };
      
      // Include layout if provided
      if (layout) {
        broadcastData.layout = layout;
        console.log('📡 [VideoWatch HOST] Broadcasting layout to all members:', layout);
      } else {
        console.warn('⚠️ [VideoWatch HOST] Layout not included in broadcast - was not provided');
      }
      
      // Include config for podcast, show, and news modes (all support title + logo)
      if ((mode === 'podcast' || mode === 'show' || mode === 'news') && config) {
        broadcastData.podcastTitle = config.title;
        broadcastData.podcastLogoURL = config.logoUrl;
        if (config.titleStyle) broadcastData.titleStyle = config.titleStyle;
        if (config.logoStyle) broadcastData.logoStyle = config.logoStyle;
        if (config.guestId) {
          broadcastData.guestUserId = config.guestId;
          broadcastData.hostUsername = currentUser?.username || 'Host';
        }
      }
      
      console.log(`📡 [VideoWatch HOST] Broadcasting ${mode} mode:`, JSON.stringify(broadcastData, null, 2));
      sendMessage(broadcastData);
    } else {
      console.warn('⚠️ [VideoWatch] Cannot broadcast mode - sendMessage not available');
    }
  };
  
  // 📹 Handle WatchFrom platform screen share
  const handleStartPlatformScreenShare = async (platformId, platformName, platformUrl) => {
    console.log(`🌐 [VideoWatch] Starting WatchFrom: ${platformName}`);
    
    // Open platform in new window
    window.open(platformUrl, '_blank', 'noopener,noreferrer');
    
    // Wait a moment for window to open
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Prompt user to share that specific tab
    try {
      setSharingSource('watchfrom');
      await handleStartLiveShare('screen', 'watchfrom');
      toast.success(`Share the ${platformName} tab from the browser prompt`);
    } catch (err) {
      toast.error('Screen share cancelled');
      setSharingSource(null);
    }
  };

  // ✅ HANDLE MEDIA SELECTION (FOR SIDEBAR)
  const handleMediaSelect = (media) => {
    if (!media) return;
    if (media.type === 'upload') {
      handlePlayMedia(media);
    } else if (media.type === 'screen_share') {
      handleStartScreenShare();
    } else if (media.type === 'end_screen_share') {
      handleEndScreenShare();
    }
  };

  // Handle Seat Assignment
  const handleSeatAssignment = (seatId) => {
    if (!currentUser || !sendMessage) return;
    const [row, col] = seatId.split('-').map(Number);
    
    // Send seat_update for UI sync across clients
    sendMessage({
      type: 'seat_update',
      userId: currentUser.id,
      seat: { row, col }
    });
    
    // 🪑 Send seat_assignment to backend for audio filtering
    sendMessage({
      type: 'seat_assignment',
      seatId: seatId,  // "row-col" format (e.g., "2-3")
      userId: currentUser.id
    });
    
    setUserSeats(prev => ({ ...prev, [currentUser.id]: seatId }));
    
    console.log(`🪑 [VideoWatch] Seat assigned: user ${currentUser.id} → seat ${seatId}`);
  };

  // Fetch Media Items (posters now generated on backend)
  const fetchAndGeneratePosters = useCallback(async () => {
    if (!roomId || !currentUser) return;
    try {
      const mediaItems = await getTemporaryMediaItemsForRoom(roomId);
      if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
        setPlaylist([]);
        return;
      }
      const normalizedItems = mediaItems.map(item => ({
        ...item,
        ID: item.ID || item.id || Date.now() + Math.random(),
        _isTemporary: true,
        poster_url: toAbsUrl(item.poster_url) || '/icons/placeholder-poster.jpg',
        file_path: toAbsUrl(item.file_path) || item.file_path,
      }));
      
      setPlaylist(normalizedItems);
    } catch (err) {
      console.error("Failed to fetch media items:", err);
      if (err.response?.status === 404) {
        toast.error('This session has ended.');
        navigate('/lobby');
        return;
      }
      setPlaylist([]);
    }
  }, [roomId, currentUser, navigate]);

  useEffect(() => {
    fetchAndGeneratePosters();
  }, [fetchAndGeneratePosters]);

  // Handle ALL WebSocket messages
  useEffect(() => {
    // If the cap in useWebSocket truncated the array, processedMessageCountRef may exceed
    // messages.length. Reset to 0 in that case so we reprocess what's in the capped array.
    // (Messages that were truncated were already processed in a prior run.)
    const startIdx = processedMessageCountRef.current > messages.length
      ? 0
      : processedMessageCountRef.current;
    const newMessages = messages.slice(startIdx);
    if (newMessages.length === 0) return;

    newMessages.forEach((message) => {
      // Only log important messages
      if (message.type.includes('liveshare') || message.type === 'screen_share_stopped' || message.type.includes('graphics')) {
        console.log('📨 [VideoWatch]', message.type, ':', message.data);
      }
      switch (message.type) {
        case "playlist_poster_updated": {
          // Backend sends a flat message {type, item_id, poster_url} — not nested under data.
          const _ppu = message.data || message;
          const normalizedPosterUrl = toAbsUrl(_ppu.poster_url) || _ppu.poster_url;
          console.log('🖼️ [VideoWatch] playlist_poster_updated:', _ppu.item_id, normalizedPosterUrl);
          setPlaylist(prev => prev.map(item =>
            (item.ID || item.id) === _ppu.item_id
              ? { ...item, poster_url: normalizedPosterUrl }
              : item
          ));
          break;
        }

        case 'temporary_media_item_added': {
          const newItem = message.data;
          if (!newItem) break;
          const normalized = {
            ...newItem,
            ID: newItem.ID || newItem.id,
            _isTemporary: true,
            poster_url: toAbsUrl(newItem.poster_url) || '/icons/placeholder-poster.jpg',
            file_path: toAbsUrl(newItem.file_path) || newItem.file_path,
          };
          console.log('📋 [VideoWatch] temporary_media_item_added:', normalized.ID, normalized.original_name);
          setPlaylist(prev => {
            if (prev.some(p => (p.ID || p.id) === normalized.ID)) return prev;
            return [...prev, normalized];
          });
          break;
        }

        case 'playlist_file_updated': {
          // Goroutine finished uploading to CDN — replace the temporary Railway path
          // with the permanent CDN URL everywhere it appears.
          const _pfu = message.data || message;
          const cdnUrl = _pfu.file_path;
          if (!cdnUrl || !_pfu.item_id) break;
          console.log('🔄 [VideoWatch] playlist_file_updated → CDN URL for item', _pfu.item_id, cdnUrl);
          setPlaylist(prev => prev.map(item =>
            (item.ID || item.id) === _pfu.item_id
              ? { ...item, file_path: cdnUrl, mediaUrl: cdnUrl }
              : item
          ));
          setCurrentMedia(prev => {
            if (!prev || (prev.ID || prev.id) !== _pfu.item_id) return prev;
            return { ...prev, file_path: cdnUrl, mediaUrl: cdnUrl };
          });
          break;
        }

        case "sync_heartbeat": {
          if (isHost) break;
          // Store the host's position + when we received it.
          // The member's drift-check effect uses this reference to detect drift locally
          // every 2s without needing more WS messages.
          // Use host browser clock (message.timestamp) — not server_ts which has WSL skew.
          const _hbLatency = Math.max(0, Date.now() - message.timestamp);
          syncRefRef.current = {
            hostTime: message.current_time + (_hbLatency / 1000),
            receivedAt: Date.now(),
          };
          console.log(`💓 [HB] Reference updated → host=${syncRefRef.current.hostTime.toFixed(3)}s (transit=${_hbLatency}ms)`);
          break;
        }

        case "session_status":
          const data = message.data;
          console.log('📊 [VideoWatch] session_status received - FULL DATA:', data);
      console.log('📊 [VideoWatch] ✨ is_private flag:', data.is_private ? 'TRUE (Ghost Mode should be enforced) ✅' : 'FALSE (Ghost Mode is optional) ❌');
          console.log('📊 [VideoWatch] session_status members type:', typeof data.members, 'isArray:', Array.isArray(data.members));

          // ✅ SESSION MEMBERS from WebSocket (active watch participants)
          // This is the SOURCE OF TRUTH for who's in the session
          if (Array.isArray(data.members)) {
            console.log('📊 [VideoWatch] Processing session members, length:', data.members.length);
            const memberMap = new Map();
            
            data.members.forEach((member, index) => {
              console.log(`📊 [VideoWatch] Processing session member ${index}:`, member);
              const id = member.user_id || member.id;
              if (!id) {
                console.warn('⚠️ [VideoWatch] Skipping member with no ID:', member);
                return;
              }

              const normalizedMember = {
                id,
                Username: member.Username || member.username || 'Anonymous',
                username: member.Username || member.username || 'Anonymous',
                avatar_url: member.avatar_url || null,
                user_role: member.user_role || 'viewer',
              };
              console.log(`📊 [VideoWatch] Normalized session member ${id}:`, normalizedMember);
              console.log(`📊 [VideoWatch] Member ${id} avatar_url:`, member.avatar_url);
              memberMap.set(id, normalizedMember);
            });
            
            const membersArray = Array.from(memberMap.values());
            console.log(`✅ [VideoWatch] Reconciling ${membersArray.length} session members from WS`);

            // Reconcile: retain existing array, remove departed, add arrivals.
            // Never replace outright — avoids a flash-to-zero on reconnect.
            setRoomMembers(prev => {
              if (prev.length === 0) return membersArray;
              const incomingIds = new Set(membersArray.map(m => m.id));
              const kept = prev.filter(m => incomingIds.has(m.id));
              const keptIds = new Set(kept.map(m => m.id));
              const added = membersArray.filter(m => !keptIds.has(m.id));
              return [...kept, ...added];
            });

            // Always mark initialized — empty is a valid resolved state, not a loading state
            setIsMembersInitialized(true);
            
            // ✅ Request current audio states from all members in the room
            console.log('🎤 [VideoWatch] Requesting audio states from all members');
            sendMessage({
              type: "request_audio_states",
              userId: currentUser?.id,
            });
          } else {
            console.error('❌ [VideoWatch] session_status members is NOT an array!', typeof data.members, data.members);
          }
          
          // ✅ RESTORE LIVESHARE STATE for late joiners (after LiveShare already started)
          if (data.liveshare_mode && data.liveshare_mode !== 'regular') {
            console.log('🔄 [VideoWatch] Restoring LiveShare state for late joiner:', {
              mode: data.liveshare_mode,
              hasPodcastTitle: !!data.podcast_title,
              hasLayout: !!data.liveshare_layout,
              layout: data.liveshare_layout,
              hasGraphics: !!(data.liveshare_banner_text || data.liveshare_ticker_items || data.liveshare_lower_third || data.liveshare_logo_bug),
              hasBreakScreen: !!data.liveshare_break_screen
            });
            
            setLiveShareContentMode(data.liveshare_mode);
            
            // Restore layout if present
            if (data.liveshare_layout) {
              console.log('🎨 [VideoWatch LATE JOINER] Restoring layout from database:', data.liveshare_layout);
              setSelectedLiveShareLayout(data.liveshare_layout);
            } else {
              console.warn('⚠️ [VideoWatch LATE JOINER] No layout found in session_status - will use default');
            }
            
            // Restore podcast/news/show config (all modes support title + logo)
            if ((data.liveshare_mode === 'podcast' || data.liveshare_mode === 'show' || data.liveshare_mode === 'news') && data.podcast_title) {
              const restoredConfig = {
                mode: data.liveshare_mode,
                title: data.podcast_title,
                logoUrl: data.podcast_logo_url || null,
                guestUserId: data.podcast_guest_user_id || null,
                hostUsername: currentUser?.username || 'Host',
                sessionId: data.session_id,
              };
              console.log(`🎙️ [VideoWatch LATE JOINER] Restoring ${data.liveshare_mode} config:`, restoredConfig);
              setPodcastConfig(restoredConfig);
            }
            
            // Restore canvas graphics (banner, ticker, lower third, logo bug)
            if (graphicsRendererRef.current) {
              let graphicsRestored = false;
              
              if (data.liveshare_banner_text) {
                try {
                  const bannerData = JSON.parse(data.liveshare_banner_text);
                  console.log('🎨 [VideoWatch] Restoring banner:', bannerData);
                  graphicsRendererRef.current.addLayer('banner', bannerData);
                  graphicsRestored = true;
                } catch (e) {
                  console.error('❌ [VideoWatch] Failed to parse banner data:', e);
                }
              }
              
              if (data.liveshare_ticker_items) {
                try {
                  const tickerData = JSON.parse(data.liveshare_ticker_items);
                  console.log('🎨 [VideoWatch] Restoring ticker:', tickerData);
                  graphicsRendererRef.current.addLayer('ticker', tickerData);
                  graphicsRestored = true;
                } catch (e) {
                  console.error('❌ [VideoWatch] Failed to parse ticker data:', e);
                }
              }
              
              if (data.liveshare_lower_third) {
                try {
                  const lowerThirdData = JSON.parse(data.liveshare_lower_third);
                  console.log('🎨 [VideoWatch] Restoring lower third:', lowerThirdData);
                  graphicsRendererRef.current.addLayer('lower_third', lowerThirdData);
                  graphicsRestored = true;
                } catch (e) {
                  console.error('❌ [VideoWatch] Failed to parse lower third data:', e);
                }
              }
              
              if (data.liveshare_logo_bug) {
                try {
                  const logoBugData = JSON.parse(data.liveshare_logo_bug);
                  console.log('🎨 [VideoWatch] Restoring logo bug:', logoBugData);
                  graphicsRendererRef.current.addLayer('logo_bug', logoBugData);
                  graphicsRestored = true;
                } catch (e) {
                  console.error('❌ [VideoWatch] Failed to parse logo bug data:', e);
                }
              }
              
              if (data.liveshare_break_screen) {
                try {
                  const breakData = JSON.parse(data.liveshare_break_screen);
                  console.log('⏸️ [VideoWatch] Restoring break screen:', breakData);
                  graphicsRendererRef.current.addLayer('break_screen', breakData);
                  graphicsRestored = true;
                } catch (e) {
                  console.error('❌ [VideoWatch] Failed to parse break screen data:', e);
                }
              }
              
              if (graphicsRestored) {
                graphicsRendererRef.current.render();
                console.log('✅ [VideoWatch] LiveShare graphics state restored for late joiner');
              }
            } else {
              console.warn('⚠️ [VideoWatch] GraphicsRenderer not initialized yet - graphics will be restored after initialization');
            }
          }

          // 👇 Rest of your screen share logic (unchanged)
          if (data.is_screen_sharing && data.screen_share_host_id) {
            const sharerId = data.screen_share_host_id;
            setCurrentMedia({ type: 'screen_share', userId: sharerId, title: 'Live Screen Share', original_name: 'Live Screen Share' });
            setIsPlaying(true);
            setIsScreenSharingActive(true);
            setScreenSharerUserId(sharerId);
          } else if (currentMedia?.type === 'screen_share') {
            setCurrentMedia(null);
            setIsPlaying(false);
            setIsScreenSharingActive(false);
            setScreenSharerUserId(null);
          }
          break;
        case "update_room_status":
          // ✅ OPTIMIZE: Don't update currentMedia if we're already in LiveShare mode with same title
          // This prevents unnecessary re-renders that interrupt video playback mid-stream
          if (message.data?.currently_playing && currentMedia?.type !== 'screen_share') {
            setCurrentMedia(prev => ({
              ...prev,
              original_name: message.data.currently_playing,
              type: message.data.is_screen_sharing ? 'screen_share' : 'upload',
            }));
          } else if (message.data?.currently_playing && currentMedia?.type === 'screen_share') {
            // Only update if the title actually changed (avoid redundant state updates)
            if (currentMedia.original_name !== message.data.currently_playing) {
              setCurrentMedia(prev => ({ ...prev, original_name: message.data.currently_playing }));
            }
          }
          
          // ✅ Clear ALL LiveShare layouts and media when host ends LiveShare
          // Works for: solo-view, split-view, screen-share
          // Works for: camera, screen, both, podcast, news, show, church modes
          if (!message.data?.is_screen_sharing && message.data?.liveshare_mode === null) {
            console.log('🛑 [VideoWatch] LiveShare ended via update_room_status', {
              currentMediaType: currentMedia?.type,
              currentLayout: selectedLiveShareLayout,
              currentContentMode: liveShareContentMode,
              hasPodcastConfig: !!podcastConfig
            });
            
            // Clear media if it's LiveShare or screen share
            if (currentMedia?.type === 'liveshare' || currentMedia?.type === 'screen_share') {
              console.log('🧹 [VideoWatch] Clearing LiveShare media (any mode)');
              setCurrentMedia(null);
              setIsPlaying(false);
            }
            
            // Clear ALL LiveShare layout states (works for all layouts & modes)
            if (selectedLiveShareLayout || liveShareContentMode || podcastConfig) {
              console.log('🧹 [VideoWatch] Clearing ALL LiveShare states:', {
                layout: selectedLiveShareLayout,
                contentMode: liveShareContentMode,
                hasPodcastConfig: !!podcastConfig
              });
              setSelectedLiveShareLayout(null);
              setLiveShareContentMode(null);
              setPodcastConfig(null);
            }
            
            setIsScreenSharingActive(false);
            setScreenSharerUserId(null);
          }
          
          // 🚨 BACKUP: If host started screen share, immediately search for tracks
          // This provides instant fallback when LiveKit ParticipantEvent.TrackPublished is delayed by network issues
          if (message.data?.is_screen_sharing && 
              message.data?.screen_sharing_user_id !== currentUser?.id && 
              room) {
            console.log('🎬 [VideoWatch MEMBER] Host started screenshare - searching for tracks NOW (backup mechanism)');
            
            // Immediately check all remote participants for video tracks
            let foundTrack = false;
            room.remoteParticipants.forEach(participant => {
              const participantUserId = participant.identity?.split('-')[1];
              
              console.log(`🔍 [VideoWatch BACKUP] Checking participant ${participant.identity}:`, {
                videoTrackCount: participant.videoTrackPublications.size,
                isHost: participantUserId === String(message.data.screen_sharing_user_id)
              });
              
              if (participantUserId === String(message.data.screen_sharing_user_id)) {
                // This is the host - check for screen share tracks
                participant.videoTrackPublications.forEach(publication => {
                  if (publication.source === Track.Source.ScreenShare || 
                      publication.source === 'screen_share') {
                    console.log('📹 [VideoWatch BACKUP] Found screen share track via WebSocket event!', {
                      trackSid: publication.trackSid,
                      source: publication.source,
                      isSubscribed: publication.isSubscribed
                    });
                    
                    if (!publication.isSubscribed) {
                      console.log('📥 [VideoWatch BACKUP] Subscribing to track immediately');
                      publication.setSubscribed(true);
                      foundTrack = true;
                    } else {
                      console.log('✅ [VideoWatch BACKUP] Track already subscribed');
                      foundTrack = true;
                    }
                  }
                });
              }
            });
            
            if (!foundTrack) {
              console.log('⏳ [VideoWatch BACKUP] No tracks found yet - LiveKit event will trigger subscription when available');
            }
          }
          break;
        case "screen_share_stopped":
          console.log('🛑 [VideoWatch] screen_share_stopped received!', {
            currentMediaType: currentMedia?.type,
            isScreenSharingActive,
            selectedLiveShareLayout,
            messageData: message.data
          });
          
          // Clear media for both LiveShare and WatchFrom screen sharing
          if (currentMedia?.type === 'screen_share' || currentMedia?.type === 'liveshare') {
            console.log('[VideoWatch] Clearing currentMedia (type:', currentMedia?.type, ')');
            setCurrentMedia(null);
          } else {
            console.log('[VideoWatch] currentMedia type mismatch - not clearing. Type:', currentMedia?.type);
          }
          
          setIsPlaying(false);
          setIsScreenSharingActive(false);
          setScreenSharerUserId(null);
          
          // Clear LiveShare layout and mode when host ends LiveShare
          console.log('[VideoWatch] Clearing LiveShare layout states');
          setSelectedLiveShareLayout(null);
          setLiveShareContentMode(null);
          setPodcastConfig(null);
          console.log('[VideoWatch MEMBER] LiveShare layout and media cleared on host End Live');
          
          showNotification('Screen sharing ended', 'info');
          break;
        
        // ✅ SESSION MEMBER EVENTS - Track active watch session participants
        case 'session_member_joined':
          // Real-time member join from backend
          console.log('📨 [VideoWatch] session_member_joined RAW:', message);
          try { new Audio('/sounds/userjoin.mp3').play(); } catch (_) {}
          if (message.data?.user_id && message.data?.username) {
            const userId = message.data.user_id;
            const username = message.data.username;
            const userRole = message.data.user_role || 'viewer';
            
            console.log(`👥 [VideoWatch] ${username} (ID:${userId}, role:${userRole}) joined session`);
            
            // 🎬 HOST: Broadcast current playback state to new member
            if (isHost && currentMedia && currentMedia.type === 'upload' && isConnected) {
              const videoEl = document.querySelector('video');
              const currentTime = videoEl?.currentTime || 0;
              
              console.log('🎯 [VideoWatch] HOST sending current state to new member:', {
                newMember: username,
                currentTime,
                mediaUrl: currentMedia.mediaUrl,
                isPlaying
              });
              
              sendMessage({
                type: 'playback_control',
                command: isPlaying ? 'play' : 'pause',
                media_item_id: currentMedia.ID || currentMedia.id,
                file_path: currentMedia.file_path,
                file_url: currentMedia.mediaUrl,
                original_name: currentMedia.original_name,
                seek_time: currentTime,
                timestamp: Date.now(),
                sender_id: currentUser.id,
              });
            }
            
            setRoomMembers(prev => {
              const exists = prev.some(m => m.id === userId);
              if (exists) {
                console.log(`⚠️ [VideoWatch] ${username} already in session, skipping duplicate`);
                return prev;
              }
              const newMembers = [...prev, {
                id: userId,
                Username: username,
                username: username,
                user_role: userRole
              }];
              console.log(`✅ [VideoWatch] ${username} added → Session now has ${newMembers.length} members:`, newMembers);
              return newMembers;
            });
          } else {
            console.error('❌ [VideoWatch] session_member_joined missing user_id or username:', message.data);
          }
          break;
        
        case 'session_member_left':
          // Real-time member leave from backend
          if (message.data?.user_id) {
            const userId = message.data.user_id;
            const username = message.data.username;
            
            console.log(`👋 [VideoWatch] ${username} (ID:${userId}) left session`);
            setRoomMembers(prev => {
              const updated = prev.filter(m => m.id !== userId);
              console.log(`👋 [VideoWatch] Session now has ${updated.length} members`);
              return updated;
            });
          }
          break;
        
        case "request_playback_state":
          console.log('📨 [VideoWatch] Received playback state request:', {
            requester_id: message.requester_id,
            isHost,
            currentMedia: currentMedia?.file_path
          });
          
          // Only host responds to state requests
          if (isHost && currentMedia && currentMedia.type === 'upload' && isConnected) {
            const videoEl = document.querySelector('video');
            const currentTime = videoEl?.currentTime || 0;
            
            console.log('📤 [VideoWatch] HOST responding to state request with current playback:', {
              requester_id: message.requester_id,
              currentTime,
              isPlaying,
              media: currentMedia.original_name
            });
            
            sendMessage({
              type: 'playback_control',
              command: isPlaying ? 'play' : 'pause',
              media_item_id: currentMedia.ID || currentMedia.id,
              file_path: currentMedia.file_path,
              file_url: currentMedia.mediaUrl,
              original_name: currentMedia.original_name,
              seek_time: currentTime,
              timestamp: Date.now(),
              sender_id: currentUser.id,
            });
          }
          break;
        
        // ... keep all other message handlers (chat, seats, camera, etc.)
        case 'participant_join':
          console.log('👤 [WebSocket] participant_join received:', message);
          const joinUserId = message.data?.userId || message.userId;
          const joinUsername = message.data?.username || message.username;
          
          if (!joinUserId) {
            console.warn('⚠️ [WebSocket] participant_join missing userId:', message);
            break;
          }
          
          setParticipants(prev => [...prev, {
            id: joinUserId,
            name: joinUsername || `User${String(joinUserId).slice(0, 4)}`,
            isSpeaking: false,
            isCameraOn: false,
            isMuted: true,
            row: null,
            col: null,
            stream: null
          }]);
          break;
        case "playback_control": {
          const pcArrivalTime = Date.now();
          console.log(`📥 [MEMBER] playback_control arrived t=${pcArrivalTime}`, {
            sender_id: message.sender_id,
            command: message.command,
            seek_time: message.seek_time,
            server_ts: message.server_ts,
            file_path: message.file_path,
            isHost,
            currentUserId: currentUser?.id,
          });

          if (isHost) {
            console.log('⏭️ [MEMBER] Skipping — host tab, already applied locally');
            break;
          }

          if (!message.file_path) {
            console.warn('⚠️ [MEMBER] playback_control has no file_path');
            break;
          }

          const isSameMedia = currentMedia && currentMedia.file_path === message.file_path;
          // Option 1: use host browser clock (message.timestamp), not server_ts.
          // Both host and member tabs share the same Windows clock — no WSL/browser drift.
          // server_ts comes from WSL which can be 600ms+ ahead of Windows Date.now().
          const transitLatency = Math.max(0, pcArrivalTime - message.timestamp);
          const adjustedTime = message.seek_time + (transitLatency / 1000);
          console.log(`⏱️ [MEMBER] transit=${transitLatency}ms seek_time=${message.seek_time} adjusted=${adjustedTime.toFixed(3)}s`);

          if (isSameMedia) {
            // Option 2: same media already loaded — operate directly on the video element.
            // Reloading video.src for a seek adds ~275ms load + ~318ms seek = ~593ms wasted.
            const videoEl = videoPlayerRef.current || document.querySelector('video');

            if (message.command === "seek" || (message.command === "play" && isPlaying)) {
              // Already playing — just reposition, video continues
              if (videoEl && adjustedTime >= 0) {
                console.log(`🔍 [MEMBER] Same-media reposition → ${adjustedTime.toFixed(3)}s`);
                videoEl.currentTime = adjustedTime;
              }
            } else if (message.command === "play" && !isPlaying) {
              // Was paused — seek to position then resume
              if (videoEl) {
                console.log(`▶️ [MEMBER] Same-media resume → ${adjustedTime.toFixed(3)}s`);
                wsArrivalTimeRef.current = pcArrivalTime;
                if (adjustedTime > 0) videoEl.currentTime = adjustedTime;
                const onSeekedResume = () => {
                  videoEl.removeEventListener('seeked', onSeekedResume);
                  const elapsed = wsArrivalTimeRef.current
                    ? (Date.now() - wsArrivalTimeRef.current) / 1000 : 0;
                  wsArrivalTimeRef.current = null;
                  if (elapsed > 0) videoEl.currentTime = videoEl.currentTime + elapsed;
                  videoEl.play().catch(err =>
                    console.error(`❌ [MEMBER] resume play failed: ${err.name}`)
                  );
                };
                videoEl.addEventListener('seeked', onSeekedResume);
              }
              setIsPlaying(true);
            } else if (message.command === "pause") {
              console.log(`⏸️ [MEMBER] Same-media pause`);
              videoEl?.pause();
              setIsPlaying(false);
            }
          } else {
            // Different media — full load path; handleLoadedData will apply seek + play
            const mediaUrl = toAbsUrl(message.file_url || message.file_path) || message.file_url || message.file_path;
            console.log(`✅ [MEMBER] New media load: ${message.original_name || 'unknown'}`);
            wsArrivalTimeRef.current = pcArrivalTime;
            // Seed syncRef so the drift-check loop has a reference immediately,
            // without waiting up to 10s for the first heartbeat.
            syncRefRef.current = { hostTime: adjustedTime, receivedAt: pcArrivalTime };
            setCurrentMedia({
              ID: message.media_item_id,
              type: 'upload',
              file_path: message.file_path,
              mediaUrl,
              original_name: message.original_name || 'Unknown Media',
            });
            setPendingSeekTime(adjustedTime);
            if (message.command === "play" || message.command === "pause") {
              setIsPlaying(message.command === "play");
              console.log(`🎬 [MEMBER] setIsPlaying(${message.command === "play"})`);
            }
          }
          break;
        }
        case "camera_toggle":
          const { user_id, is_camera_on } = message.data;
          setParticipants(prev => {
            const exists = prev.some(p => p.id === user_id);
            if (exists) {
              return prev.map(p => p.id === user_id ? { ...p, isCameraOn: is_camera_on } : p);
            } else {
              return [...prev, {
                id: user_id,
                name: `User${user_id}`,
                isSpeaking: false,
                isCameraOn: is_camera_on,
                isMuted: true,
                row: null,
                col: null,
                stream: null
              }];
            }
          });
          break;
        case "chat_message":
          // ✅ Match against sessionStatus.id OR URL session_id
          const activeSessionId = sessionStatus?.id || urlSessionId;
          if (message.data.session_id === activeSessionId) {
            const chatMsg = { ...message.data, reactions: message.data.reactions || [] };
            setSessionChatMessages(prev => {
              const exists = prev.some(msg => msg.ID === chatMsg.ID);
              return exists ? prev : [...prev, chatMsg];
            });
          }
          break;
        case "reaction":
          // ✅ Match against sessionStatus.id OR URL session_id
          const reactionSessionId = sessionStatus?.id || urlSessionId;
          if (message.data.session_id === reactionSessionId) {
            console.log('👍 [VideoWatch] Received reaction:', message.data);
            setSessionChatMessages(prev =>
              prev.map(msg => {
                if (message.data.message_id && msg.ID !== message.data.message_id) return msg;
                const alreadyReacted = (msg.reactions || []).some(
                  r => r.user_id === message.data.user_id && r.emoji === message.data.emoji
                );
                if (alreadyReacted) return msg;
                const updatedMsg = { ...msg, reactions: [...(msg.reactions || []), message.data] };
                console.log('👍 [VideoWatch] Updated message with reaction:', updatedMsg);
                return updatedMsg;
              })
            );
          }
          break;
        case 'participant_leave':
          setParticipants(prev => prev.filter(p => p.id !== message.userId));
          break;
        case 'user_left':
          // ✅ Handle WebSocket disconnect cleanup - remove from member list
          if (message.data?.userId || message.data?.user_id) {
            const leftUserId = message.data.userId || message.data.user_id;
            console.log('👋 [VideoWatch] User left (disconnect):', leftUserId);
            setRoomMembers(prev => {
              const updated = prev.filter(m => m.id !== leftUserId);
              console.log('👋 [VideoWatch] Updated member count:', prev.length, '→', updated.length);
              return updated;
            });
          }
          break;
        case 'seat_update':
          const { userId, seat } = message;
          setParticipants(prev => prev.map(p => p.id === userId ? { ...p, row: seat.row, col: seat.col } : p));
          setUserSeats(prev => ({ ...prev, [userId]: `${seat.row}-${seat.col}` }));
          break;
        case 'seating_sync':
          const syncedSeats = message.seats || {};
          setUserSeats(syncedSeats);
          
          // 🪑 Send all seat assignments to backend for audio filtering
          Object.entries(syncedSeats).forEach(([userId, seatId]) => {
            sendMessage({
              type: 'seat_assignment',
              seatId: seatId,
              userId: parseInt(userId)
            });
          });
          
          console.log('🪑 [VideoWatch] Seating synced and sent to backend:', syncedSeats);
          break;
        case 'user_speaking':
          setSpeakingUsers(prev => message.speaking 
            ? new Set([...prev, message.userId]) 
            : new Set([...prev].filter(id => id !== message.userId))
          );
          break;
        case 'user_audio_state':
          // Handle remote user audio state changes
          const { userId: audioUserId, isAudioActive: remoteAudioActive } = message;
          
          console.log(`🔊 [VideoWatch] Received user_audio_state from user ${audioUserId}: ${remoteAudioActive ? 'UNMUTED' : 'MUTED'}`);
          
          // ✅ Update remoteAudioStates for ALL users (including self for cross-tab sync)
          setRemoteAudioStates(prev => ({
            ...prev,
            [audioUserId]: {
              ...prev[audioUserId],
              isMuted: !remoteAudioActive,
            }
          }));
          
          // Update speaking users set
          setSpeakingUsers(prev => {
            const updated = new Set(prev);
            if (remoteAudioActive) {
              updated.add(audioUserId);
            } else {
              updated.delete(audioUserId);
            }
            return updated;
          });
          
          // Update participants list to reflect muted/unmuted state
          setParticipants(prev => 
            prev.map(p => p.id === audioUserId ? { ...p, isMuted: !remoteAudioActive } : p)
          );
          break;
        case 'broadcast_audio_state':
          // Another member is requesting audio states - send our current state
          console.log('🎤 [VideoWatch] Received broadcast_audio_state request - sending current state');
          
          // Extract current user's row from userSeats
          const currentUserSeatId = userSeats[currentUser?.id];
          const currentUserRow = currentUserSeatId ? parseInt(currentUserSeatId.split('-')[0]) : null;
          
          // Check if user has broadcast permission
          const hasUserBroadcastPermission = broadcastPermissions[currentUser?.id] || false;
          const isGlobalBroadcast = (isHost && isHostBroadcasting) || hasUserBroadcastPermission;
          
          // Send current audio state
          sendMessage({
            type: "user_audio_state",
            isAudioActive: isAudioActive,
            userId: currentUser.id,
            isSeatedMode: isSeatedMode,
            isGlobalBroadcast: isGlobalBroadcast,
            row: isSeatedMode && currentUserRow !== null ? currentUserRow : null,
          });
          console.log(`🎤 [VideoWatch] Sent audio state: ${isAudioActive ? 'UNMUTED' : 'MUTED'}`);
          break;
        case "platform_selected":
          if (message.data?.user_id === currentUser?.id) {
            const platform = PLATFORMS.find(p => p.id === message.data.platform_id);
            setSelectedPlatform(platform);
          }
          break;
        case "watch_from_selected":
          showNotification(
            `${message.data.userId === currentUser?.id ? 'You' : `User ${message.data.userId}`} is watching from ${message.data.platform}`,
            'info'
          );
          break;
        case "take_seat":
          // Update userSeats when someone takes a seat
          if (message.data?.user_id && message.data?.seat_id) {
            setUserSeats(prev => ({
              ...prev,
              [message.data.user_id]: message.data.seat_id
            }));
          }
          break;
        case "seat_swap_request":
          // Show notification to target user
          if (message.data?.target_user_id === currentUser?.id) {
            setSeatSwapRequest({
              requesterId: message.data.requester_id,
              requesterName: message.data.requester_name || `User${message.data.requester_id?.toString().slice(0, 4)}`,
              targetSeat: message.data.target_seat
            });
          }
          break;
        case "seat_swap_accepted":
          // Swap the seats for both users
          if (message.data?.requester_id && message.data?.target_id) {
            setUserSeats(prev => {
              const requesterSeat = prev[message.data.requester_id];
              const targetSeat = prev[message.data.target_id];
              return {
                ...prev,
                [message.data.requester_id]: targetSeat,
                [message.data.target_id]: requesterSeat
              };
            });
            if (message.data.requester_id === currentUser?.id || message.data.target_id === currentUser?.id) {
              showNotification('Seat swap completed!', 'success');
            }
          }
          setSeatSwapRequest(null);
          break;
        case "seat_swap_declined":
          if (message.data?.requester_id === currentUser?.id) {
            showNotification('Seat swap request was declined', 'info');
          }
          setSeatSwapRequest(null);
          break;
        case "seats_auto_assigned":
          console.log('🪑 [WebSocket] Received seats_auto_assigned:', message);
          // ✅ Backend sends user_seats at root level, not in message.data
          if (message.user_seats) {
            console.log('🪑 [WebSocket] Setting userSeats:', message.user_seats);
            setUserSeats(message.user_seats);
            showNotification('Seats have been auto-assigned!', 'success');
          } else {
            console.warn('🪑 [WebSocket] seats_auto_assigned message missing user_seats field');
            console.warn('🪑 [WebSocket] Full message:', JSON.stringify(message));
          }
          break;
        case "seats_cleared":
          console.log('🪑 [WebSocket] Received seats_cleared');
          // Seating mode disabled, clear all seats
          setUserSeats({});
          showNotification('Seating mode disabled', 'info');
          break;
        case "seating_mode_toggle":
          // Echo of our own toggle message, ignore
          break;
        case "camera_started":
          // Remote user started their camera - mark participant as having camera on
          console.log('🎥 [WebSocket] User started camera:', message.user_id);
          setParticipants(prev => 
            prev.map(p => 
              p.id === message.user_id 
                ? { ...p, isCameraOn: true } 
                : p
            )
          );
          break;
        case "camera_stopped":
          // Remote user stopped their camera - mark participant as camera off for instant update
          console.log('🎥 [WebSocket] User stopped camera:', message.user_id);
          setParticipants(prev => 
            prev.map(p => 
              p.id === message.user_id 
                ? { ...p, isCameraOn: false, stream: null } 
                : p
            )
          );
          break;
        
        case "session_ended":
          // Clear private messages and unread counts
          setPrivateMessages({});
          setUnreadMessages({});
          // Reset sidebar tab so next session starts on Upload, not LiveShare
          sessionStorage.removeItem('wewatch_active_sidebar_tab');
          
          // Clear compression state from LeftSidebar
          if (leftSidebarCleanupRef.current) {
            leftSidebarCleanupRef.current();
          }
          
          // Clear ticket cache for this session
          if (urlSessionId) {
            clearTicketCache(message.data?.session_id || urlSessionId);
          }
          
          // Store session data for rating modal (if not the host)
          const isCurrentUserHost = currentUser?.id === message.data?.host_id;
          if (!isCurrentUserHost && message.data?.session_id) {
            const sessionData = {
              sessionId: message.data.session_id,
              hostId: message.data.host_id,
              hostName: message.data.host_name || 'Unknown Host',
              sessionTitle: message.data.session_title || 'Untitled Session',
              watchType: message.data.watch_type,
              isTemporary: message.data.is_temporary || false,
            };
            sessionStorage.setItem(`pending_rating_${roomId}`, JSON.stringify(sessionData));
          }
          
          // Show toast notification
          const reason = message.data?.reason;
          if (reason === 'host_timeout') {
            toast('Session ended - Host disconnected for over 10 minutes', {
              icon: '⏰',
              duration: 5000,
              id: 'session-ended',
            });
          } else {
            toast('Watch session ended', {
              icon: 'ℹ️',
              duration: 3000,
              id: 'session-ended',
            });
          }
          
          // Perform cleanup only for members (host already cleaned up in handleLeaveRoom)
          if (isCurrentUserHost) {
            break;
          }
          
          performCleanupAndExit(message.data?.is_temporary);
          break;
        case 'heart_animation':
          setShowHeartAnimation(true);
          break;

        case 'kicked_from_room': {
          const kickReason = message.data?.reason;
          if (kickReason === 'banned') {
            toast.error('You have been banned from this room');
          } else {
            toast.error('You have been removed from this room by the host');
          }
          performCleanupAndExit(false);
          break;
        }
        case 'ticket_required':
          // Backend rejected connection - no ticket for paid session
          console.log('❌ [VideoWatch] Ticket required:', message.data);
          toast.error('This is a paid session. Please purchase a ticket.');
          setTimeout(() => {
            navigate(`/rooms/${roomId}?openTicketModal=true`);
          }, 1000);
          break;
        case 'private_chat_message':
          // ✅ Only process if current user is the RECEIVER (not sender)
          // This prevents duplicates from WebSocket echo when we send messages
          if (message.to_user_id === currentUser?.id) {
            const otherUserId = message.from_user_id;
            setPrivateMessages(prev => ({
              ...prev,
              [otherUserId]: [...(prev[otherUserId] || []), message]
            }));
            
            // ✅ Increment unread count if chat is not currently open with this user
            if (privateChatUser?.id !== otherUserId) {
              setUnreadMessages(prev => ({
                ...prev,
                [otherUserId]: (prev[otherUserId] || 0) + 1
              }));
            }
          }
          break;
        case 'private_chat_history':
          const { other_user_id, messages: history } = message.data;
          setPrivateMessages(prev => ({
            ...prev,
            [other_user_id]: history
          }));
          break;
        case 'broadcast_permission_changed':
          // Host granted/revoked broadcast permission
          const { user_id: affectedUserId, can_broadcast } = message.data;
          console.log('🔊 [VideoWatch] Broadcast permission changed:', affectedUserId, can_broadcast);
          
          setBroadcastPermissions(prev => ({
            ...prev,
            [affectedUserId]: can_broadcast
          }));
          
          // Show toast notification
          if (affectedUserId === currentUser?.id) {
            if (can_broadcast) {
              toast.success('You can now speak to the whole room!', {
                icon: '🔊',
                duration: 4000,
              });
            } else {
              toast('You can now only speak to your row', {
                icon: '🔈',
                duration: 4000,
              });
            }
          }
          break;
        
        case "force_mute":
          // Host has muted all members
          console.log('🔇 [VideoWatch] Received force_mute command from backend');
          console.log('🔇 [VideoWatch] BEFORE force_mute - Track state:', {
            isAudioActive,
            isMutedByHost,
            trackEnabled: publishedAudioTrackRef.current?.enabled,
            trackIsMuted: publishedAudioTrackRef.current?.isMuted,
            trackExists: !!publishedAudioTrackRef.current
          });
          
          setIsMutedByHost(true);
          setShowMuteAllBanner(true);
          
          // Force disable microphone (only use .enabled, not .mute())
          if (publishedAudioTrackRef.current) {
            console.log('🔇 [VideoWatch] Disabling audio track via enabled=false');
            publishedAudioTrackRef.current.enabled = false;
            console.log('🔇 [VideoWatch] AFTER disabling - Track state:', {
              trackEnabled: publishedAudioTrackRef.current.enabled,
              trackIsMuted: publishedAudioTrackRef.current.isMuted
            });
          }
          setIsAudioActive(false);
          
          // ✅ Update remote audio states so Members Modal shows mute icon
          setRemoteAudioStates(prev => ({
            ...prev,
            [currentUser.id]: {
              ...prev[currentUser.id],
              isMuted: true,
              isSpeaking: false,
              audioLevel: 0,
            }
          }));
          
          // ✅ Broadcast muted state to all members
          sendMessage({
            type: "user_audio_state",
            isAudioActive: false,
            userId: currentUser.id,
          });
          
          console.log('🔇 [VideoWatch] Audio state after force_mute:', {
            isAudioActive: false,
            isMutedByHost: true,
            trackEnabled: publishedAudioTrackRef.current?.enabled
          });
          
          // Hide banner after 5 seconds
          setTimeout(() => setShowMuteAllBanner(false), 5000);
          break;

        case "unlock_mute":
          // Host has unlocked mute - enable button but keep audio muted
          // User must manually unmute if they want to speak
          console.log('🔊 [VideoWatch] Received unlock_mute command from backend');
          console.log('🔊 [VideoWatch] BEFORE unlock_mute - Track state:', {
            isAudioActive,
            isMutedByHost,
            trackEnabled: publishedAudioTrackRef.current?.enabled,
            trackIsMuted: publishedAudioTrackRef.current?.isMuted,
            trackExists: !!publishedAudioTrackRef.current
          });
          
          setIsMutedByHost(false);
          
          // ✅ Keep audio muted - user can manually unmute if desired
          // Do NOT auto-enable the track or set isAudioActive to true
          console.log('🔊 [VideoWatch] Mute button unlocked but audio remains muted');
          
          // ✅ Update remote audio states to keep muted icon (stays muted until user manually unmutes)
          setRemoteAudioStates(prev => ({
            ...prev,
            [currentUser.id]: {
              ...prev[currentUser.id],
              isMuted: true, // Still muted, just unlocked
              isSpeaking: false,
              audioLevel: 0,
            }
          }));
          
          // ✅ Broadcast still-muted state
          sendMessage({
            type: "user_audio_state",
            isAudioActive: false, // Still muted
            userId: currentUser.id,
          });
          
          console.log('🔊 [VideoWatch] AFTER unlock_mute - Track state:', {
            isAudioActive,
            isMutedByHost: false,
            trackEnabled: publishedAudioTrackRef.current?.enabled,
            trackIsMuted: publishedAudioTrackRef.current?.isMuted
          });
          
          // Show brief notification
          toast.success('Host has unlocked your microphone - you can now unmute', {
            icon: '🔊',
            duration: 3000,
          });
          break;
        
        case "raise_hand":
          // Member raised their hand
          console.log('✋ [VideoWatch] Received raise_hand:', message.data || message);
          const raisedUserId = message.userId || message.data?.userId;
          const raisedUsername = message.username || message.data?.username;
          const raisedSeatId = message.seatId || message.data?.seatId;
          
          if (raisedUserId) {
            setRaisedHands(prev => {
              // Don't add duplicate
              if (prev.some(h => h.userId === raisedUserId)) return prev;
              
              const newHand = {
                userId: raisedUserId,
                username: raisedUsername || `User ${raisedUserId}`,
                seatId: raisedSeatId,
                timestamp: Date.now()
              };
              
              // Show toast notification to host/admin
              if (isHost || isAdmin) {
                toast(`✋ ${newHand.username} raised their hand`, {
                  icon: '✋',
                  duration: 4000,
                  position: 'top-right'
                });
              }
              
              return [...prev, newHand];
            });
          }
          break;
        
        case "lower_hand":
          // Member lowered their hand
          console.log('👋 [VideoWatch] Received lower_hand:', message.data || message);
          const loweredUserId = message.userId || message.data?.userId;
          
          if (loweredUserId) {
            setRaisedHands(prev => prev.filter(h => h.userId !== loweredUserId));
          }
          break;
          
        case "emote":
          // Member sent an emote
          const { userId: emoteUserId, emote: receivedEmote } = message.data || message;
          
          console.log('😊 [VideoWatch] Received emote:', { emoteUserId, receivedEmote });
          
          // Don't process our own emotes (already shown locally)
          if (emoteUserId === currentUser?.id) break;
          
          // Map emote IDs to emojis
          const emoteEmojiMap = {
            'thumbs_up': '👍',
            'heart': '❤️',
            'laugh': '😂',
            'celebrate': '🎉',
            'fire': '🔥',
            'clap': '👏',
          };
          
          const emoteEmoji = emoteEmojiMap[receivedEmote] || '✨';
          
          // Update member emote for card display (2 seconds)
          setMemberEmotes(prev => ({
            ...prev,
            [emoteUserId]: { emote: emoteEmoji, timestamp: Date.now() }
          }));
          
          // Auto-clear after 2 seconds
          setTimeout(() => {
            setMemberEmotes(prev => {
              const updated = { ...prev };
              // Only clear if timestamp matches (prevents clearing newer emotes)
              const current = updated[emoteUserId];
              if (current && Date.now() - current.timestamp >= 2000) {
                delete updated[emoteUserId];
              }
              return updated;
            });
          }, 2000);
          break;
          
        case "liveshare_mode_selected":
          // Host selected LiveShare mode - broadcast received by all members
          console.log('🎬 [VideoWatch] Received liveshare_mode_selected:', {
            mode: message.data?.mode,
            layout: message.data?.layout
          });
          
          if (message.data?.mode) {
            const mode = message.data.mode;
            setLiveShareContentMode(mode);
            
            // Set layout if provided
            if (message.data.layout) {
              setSelectedLiveShareLayout(message.data.layout);
            }
            
            // If podcast, show, news, or church mode, extract and set config (all support title + logo)
            if (mode === 'podcast' || mode === 'show' || mode === 'news' || mode === 'church') {
              const configData = {
                mode: mode,
                title: message.data.podcastTitle || `Untitled ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
                logoUrl: message.data.podcastLogoURL || null,
                titleStyle: message.data.titleStyle || null,
                logoStyle: message.data.logoStyle || null,
                guestUserId: message.data.guestUserId || null,
                hostUsername: message.data.hostUsername || currentUser?.username || 'Host',
                sessionId: sessionStatus?.id || urlSessionId,
              };
              setPodcastConfig(configData);
              
              // For church mode, load current Bible verse and hymn if exists (late joiner support)
              if (mode === 'church') {
                if (message.data.currentBibleVerse) {
                  console.log('📖 [VideoWatch] Loading current Bible verse for late joiner:', message.data.currentBibleVerse);
                  setCurrentBibleVerse(message.data.currentBibleVerse);
                  setIsBibleVerseActive(true);
                }
                if (message.data.currentHymn) {
                  console.log('🎵 [VideoWatch] Loading current hymn for late joiner:', message.data.currentHymn);
                  setCurrentHymn(message.data.currentHymn);
                  setCurrentHymnVerse(message.data.currentHymnVerse || 1);
                  setIsHymnActive(true);
                }
              }
            } else {
              setPodcastConfig(null);
            }
          }
          break;
          
        case "liveshare_permission_granted":
          // Guest received permission from host
          if (message.data?.hasPermission) {
            setHasLiveSharePermission(true);
            setForceActiveTab('liveshare');
            setTimeout(() => setForceActiveTab(null), 100);
            // Auto-trigger the guest invitation popup in LiveShareManager
            setGuestInviteAutoTrigger({
              mode: message.data.mode || 'podcast',
              title: message.data.title || null,
              hostUsername: message.data.hostUsername || 'Host',
            });
          }
          break;
          
        case "liveshare_graphics_update":
          // Graphics updates are handled by separate useEffect - silent
          break;
          
        case "liveshare_break_started":
          console.log('⏸️ [VideoWatch] Break started:', message.data);
          {
            const bSource = message.data?.screenSource;
            if (!bSource || bSource === 'static') {
              // React DOM overlay — CSS animations, countdown, no canvas needed
              setIsBreakActive(true);
              setViewerBreakEndTime(Date.now() + (message.data?.duration ?? 5) * 60 * 1000);
            } else if (graphicsRendererRef.current && message.data) {
              // Non-static sources (custom image, ad, media) use the canvas renderer
              graphicsRendererRef.current.addLayer('break_screen', {
                type: 'break_screen',
                content: {
                  screenSource: bSource,
                  customImage: message.data.customImage,
                  timeRemaining: message.data.duration * 60,
                  keepAudio: message.data.keepAudio
                },
                zIndex: 100
              });
              graphicsRendererRef.current.render();
            }
          }
          
          // Mute camera video using LiveKit API if turnOffCamera is true
          if (message.data.turnOffCamera && cameraShareTrackRef.current) {
            console.log('📹 [VideoWatch] Muting camera track for break (LiveKit)');
            cameraShareTrackRef.current.mute()
              .then(() => console.log('✅ [VideoWatch] Camera track muted successfully'))
              .catch(error => console.error('❌ [VideoWatch] Failed to mute camera:', error));
          }
          
          toast('Taking a break - Stream paused', {
            icon: '⏸️',
            duration: 3000
          });
          break;
          
        case "liveshare_break_ended":
          console.log('▶️ [VideoWatch] Break ended');
          // Clear React overlay
          setIsBreakActive(false);
          setViewerBreakEndTime(null);
          // Also clear canvas layer in case non-static source was active
          if (graphicsRendererRef.current) {
            graphicsRendererRef.current.removeLayer('break_screen');
            graphicsRendererRef.current.render();
          }
          
          // Unmute camera video using LiveKit API
          if (cameraShareTrackRef.current) {
            console.log('📹 [VideoWatch] Unmuting camera track (LiveKit)');
            cameraShareTrackRef.current.unmute()
              .then(() => console.log('✅ [VideoWatch] Camera track unmuted successfully'))
              .catch(error => console.error('❌ [VideoWatch] Failed to unmute camera:', error));
          }
          
          toast.success('Break ended - Stream resumed', {
            icon: '▶️',
            duration: 3000
          });
          break;
          
        case "bible_verse_update":
          console.log('📖 [VideoWatch] Bible verse update:', message.data);
          // Bible overlay is handled in VideoWatch separately (not GraphicsRenderer)
          // This will trigger the BibleOverlay component to show/hide
          break;
          
        case "liveshare_guest_joined":
          // Guest joined - auto-switch layout (HOST only)
          if (isHost && message.data?.suggestedLayout) {
            console.log('🎙️ [VideoWatch HOST] Guest joined with share type:', message.data.guestShareType);
            console.log('🎨 [VideoWatch HOST] Auto-switching to layout:', message.data.suggestedLayout);
            
            // Save current layout before switching (for reversion when guest leaves)
            const currentLayout = selectedLiveShareLayout;
            console.log('💾 [VideoWatch HOST] Saving previous layout:', currentLayout);
            
            // Switch to suggested layout
            setSelectedLiveShareLayout(message.data.suggestedLayout);
            
            toast(`Guest joined - switched to ${message.data.suggestedLayout.replace('-', ' ')}`, {
              icon: '🎙️',
              duration: 3000
            });
          }
          break;
          
        case "liveshare_guest_switched_type":
          // Guest switched share type - update layout (HOST only)
          if (isHost && message.data?.suggestedLayout) {
            console.log('🔄 [VideoWatch HOST] Guest switched to:', message.data.newShareType);
            console.log('🎨 [VideoWatch HOST] Auto-switching to layout:', message.data.suggestedLayout);
            
            setSelectedLiveShareLayout(message.data.suggestedLayout);
            
            toast(`Guest switched to ${message.data.newShareType} - layout updated`, {
              icon: '🔄',
              duration: 3000
            });
          }
          break;
          
        case "liveshare_layout_update":
          // Guest or host pushed a layout update — applies to all viewers
          if (message.data?.layout) {
            setSelectedLiveShareLayout(message.data.layout);
          }
          break;

        case "liveshare_guest_left":
          // Guest left - revert to smart default layout (HOST only)
          if (isHost && message.data?.defaultLayout) {
            console.log('👋 [VideoWatch HOST] Guest left');
            console.log('🎨 [VideoWatch HOST] Reverting to layout:', message.data.defaultLayout);
            
            setSelectedLiveShareLayout(message.data.defaultLayout);
            
            toast(`Guest left - layout restored`, {
              icon: '👋',
              duration: 3000
            });
          }
          break;
          
        case "room_post_created":
          // Room host created a new post (recording or upload)
          if (message.data) {
            console.log('📝 [VideoWatch] Room post created:', message.data);
            toast.success(`${message.data.author_username} posted a ${message.data.media_type}!`, {
              icon: '🎬',
              duration: 4000,
            });
          }
          break;
          
        default:
          // Known informational message types that don't need action
          if (message.type === 'session_preview_updated' || message.type === 'media_state_changed') {
            // These are informational broadcasts - no action needed
            break;
          }
          console.warn("[VideoWatch] Unknown WebSocket message type:", message.type, message);
      }
    });
    // Clear processed messages and reset the index counter.
    // This keeps the array near zero length rather than growing for the session's lifetime.
    // The 500-entry cap in useWebSocket acts as a safety backstop if clearMessages is slow.
    processedMessageCountRef.current = 0;
    clearMessages();
  }, [messages, sessionStatus.id, currentUser?.id, currentMedia, localParticipant, clearMessages]);

  // Host → members reference heartbeat every 10s.
  // Just refreshes the member's syncRefRef — the member does its own drift checks locally.
  useEffect(() => {
    if (!isHost || !isPlaying || !isConnected) return;
    const id = setInterval(() => {
      const videoEl = videoPlayerRef.current || document.querySelector('video');
      if (!videoEl || videoEl.paused) return;
      sendMessage({ type: 'sync_heartbeat', current_time: videoEl.currentTime, timestamp: Date.now() });
    }, 10000);
    return () => clearInterval(id);
  }, [isHost, isPlaying, isConnected, sendMessage]);

  // Member autonomous drift check every 2s.
  // Computes expected = lastKnownHostTime + elapsed and corrects only when drift > 1s.
  // No WS traffic — purely local arithmetic against the stored syncRefRef reference.
  useEffect(() => {
    if (isHost || !isPlaying) return;
    const id = setInterval(() => {
      if (!syncRefRef.current) return;
      const videoEl = videoPlayerRef.current || document.querySelector('video');
      if (!videoEl || videoEl.paused) return;
      const elapsed = (Date.now() - syncRefRef.current.receivedAt) / 1000;
      const expected = syncRefRef.current.hostTime + elapsed;
      const drift = videoEl.currentTime - expected; // positive = member ahead
      const absDrift = Math.abs(drift);
      if (absDrift > 1.0 && absDrift < 30) {
        console.log(`🔄 [Drift] Auto-correct ${drift > 0 ? 'ahead' : 'behind'} ${absDrift.toFixed(2)}s → ${expected.toFixed(2)}s`);
        videoEl.currentTime = expected;
      }
    }, 2000);
    return () => clearInterval(id);
  }, [isHost, isPlaying]);

  // Handle Chat
  const handleSendSessionMessage = async () => {
    // ✅ Use sessionStatus.id or fallback to URL session_id
    const activeSessionId = sessionStatus?.id || urlSessionId;
    
    console.log('💬 [VideoWatch] handleSendSessionMessage called', {
      hasMessage: !!newSessionMessage.trim(),
      sessionStatusId: sessionStatus?.id,
      urlSessionId: urlSessionId,
      activeSessionId: activeSessionId,
      hasSendMessage: !!sendMessage,
      currentUser: currentUser?.id,
      messageContent: newSessionMessage
    });
    
    if (!newSessionMessage.trim()) {
      console.warn('💬 [VideoWatch] Empty message, not sending');
      return;
    }
    
    if (!activeSessionId) {
      console.error('💬 [VideoWatch] No session ID available!', { sessionStatus, urlSessionId });
      return;
    }
    
    if (!sendMessage) {
      console.error('💬 [VideoWatch] sendMessage function not available!');
      return;
    }
    
    const chatMessage = {
      type: "chat_message",
      data: { 
        message: newSessionMessage.trim(), 
        session_id: activeSessionId,
        user_id: currentUser?.id,
        username: currentUser?.username || `User${currentUser?.id}`
      },
    };
    
    console.log('💬 [VideoWatch] Sending chat message:', chatMessage);
    sendMessage(chatMessage);
    setNewSessionMessage('');
  };

  // Handle Reaction to Message
  const handleReactToMessage = (messageId, emoji) => {
    if (!sessionStatus.id || !sendMessage) return;
    const reactionMessage = {
      type: "reaction",
      data: {
        message_id: messageId,
        emoji: emoji,
        user_id: currentUser?.id,
        session_id: sessionStatus.id,
        timestamp: Date.now()
      }
    };
    sendMessage(reactionMessage);
  };

  // Autodirect to session
  useEffect(() => {
    if (sessionStatus?.session_id && !window.location.search.includes('session_id')) {
      const url = new URL(window.location);
      url.searchParams.set('session_id', sessionStatus.session_id);
      window.history.replaceState({}, '', url);
    }
  }, [sessionStatus?.session_id]);

  // Handle Video End
  const handleVideoEnd = () => {
    const currentIndex = playlist.findIndex(item => item.ID === currentMedia?.ID);
    if (currentIndex === -1) {
      setCurrentMedia(null);
      setIsPlaying(false);
      return;
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex < playlist.length) {
      const nextItem = playlist[nextIndex];
      setCurrentMedia(nextItem);
      setPlaylist(prev => prev.filter(item => item.ID !== currentMedia.ID));
      setIsPlaying(true);
    } else {
      setCurrentMedia(null);
      setIsPlaying(false);
    }
  };

  // Handle Leave Room
  const handleLeaveRoom = async () => {
    const finalSessionId = sessionStatus?.id || urlSessionId || activeSessionId;

    // Determine if this is an instant watch BEFORE any cleanup changes the URL
    const urlParams = new URLSearchParams(window.location.search);
    const isInstantWatch = urlParams.get('instant') === 'true';

    if (isHost) {
      const confirmed = window.confirm(
        "End watch session for everyone? All participants will be returned to the lobby."
      );

      if (!confirmed) {
        return;
      }

      // Mark ended immediately so re-fetch on RoomPage doesn't resurrect the session
      sessionStorage.setItem(`session_ended_${roomId}`, 'true');

      // Fire the end-session API call in the background — do NOT await it.
      // Backend writes DB + broadcasts session_ended to all participants immediately.
      // Awaiting the round-trip (Vercel → Railway) was blocking navigation for 500ms-2s.
      if (finalSessionId) {
        apiClient.post(`/api/rooms/${roomId}/sessions/${finalSessionId}/end`)
          .catch(err => console.error('[handleLeaveRoom] background end-session failed:', err));
      }
    }

    // Navigate immediately — cleanup is non-blocking
    await performCleanupAndExit(isInstantWatch);
  };

  // Cleanup and navigate helper
  const performCleanupAndExit = async (isTemporaryRoom = null) => {
    // Guard: session_ended WS and manual Leave Call can race — only exit once
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    // 1. Fire LiveKit disconnect in the background — don't block navigation on WebRTC teardown.
    // disconnectLiveKit() may return undefined if LiveKit is already disconnected — guard the .catch().
    if (disconnectLiveKit) {
      try {
        const p = disconnectLiveKit();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    }

    // 2. Stop camera stream
    if (cameraPreviewStream) {
      cameraPreviewStream.getTracks().forEach(track => track.stop());
      setCameraPreviewStream(null);
    }

    clearInterval(previewIntervalRef.current);
    previewIntervalRef.current = null;

    // 3. Clear chat messages
    setSessionChatMessages([]);
    setNewSessionMessage('');
    setIsChatOpen(false);

    // 4. WebSocket cleanup happens automatically via useWebSocket cleanup

    // 5. Navigate: if temporary room (instant watch), go to lobby; otherwise go to room page
    try {
      let isTemporary = isTemporaryRoom;
      
      // If not passed as parameter, try to determine from session data
      if (isTemporary === null) {
        const sessionDataStr = sessionStorage.getItem(`pending_rating_${roomId}`);
        
        if (sessionDataStr) {
          try {
            const sessionData = JSON.parse(sessionDataStr);
            isTemporary = sessionData.isTemporary || false;
          } catch (e) {
            console.error('Error parsing session data:', e);
          }
        }
        
        // Fallback: check URL parameter
        if (isTemporary === null || isTemporary === false) {
          const urlParams = new URLSearchParams(window.location.search);
          const instantParam = urlParams.get('instant');
          if (instantParam === 'true') {
            isTemporary = true;
          }
        }
        
        // Additional fallback: check roomData
        if (isTemporary === null && roomData?.is_temporary !== undefined) {
          isTemporary = roomData.is_temporary;
        }
      }
      
      if (isTemporary) {
        navigate('/lobby', { replace: true });
      } else {
        navigate(`/rooms/${roomId}`, { replace: true });
      }
    } catch (err) {
      console.error('Navigation error:', err);
      navigate(`/rooms/${roomId}`, { replace: true });
    }
  };

  // Cleanup camera
  useEffect(() => {
    return () => {
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraPreviewStream]);

  // Mouse move for taskbar
  useEffect(() => {
    const handleMouseMove = (e) => {
      const windowHeight = window.innerHeight;
      const mouseY = e.clientY;
      if (mouseY > windowHeight * 0.9) {
        setIsVisible(true);
        if (isGlowing) setIsGlowing(false);
      } else if (mouseY < windowHeight * 0.8) {
        setIsVisible(false);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ✅ Reusable function to fetch and set room members
  const fetchRoomMembers = useCallback(async () => {
    if (!roomId) return;
    setLoadingMembers(true);
    try {
      const response = await getRoomMembers(roomId);
      console.log("🔍 Raw room members from API:", response);
      let rawMembers = Array.isArray(response) ? response : response?.members || [];
      console.log("🧹 Normalized members array:", rawMembers);

      // 🔑 Deduplicate by user ID and normalize
      const memberMap = new Map();
      rawMembers.forEach(member => {
        // Use user_id or id — be flexible
        const id = member.user_id || member.id;
        if (!id) return; // skip invalid entries

        // Prefer existing entry or use this one
        if (!memberMap.has(id)) {
          memberMap.set(id, {
            id,
            Username: member.Username || member.username || 'Anonymous',
            user_role: member.user_role || 'viewer',
            // Add other fields you need
          });
        }
      });

      const deduplicatedMembers = Array.from(memberMap.values());
      setRoomMembers(deduplicatedMembers);

      // Set host
      const hostMember = deduplicatedMembers.find(m => m.user_role === 'host');
      if (hostMember) {
        setRoomHostId(hostMember.id);
      }
    } catch (err) {
      console.error("Failed to fetch room members:", err);
      // Keep existing members on error — a failed refresh is less harmful than a blank list
      setIsMembersInitialized(true);
    } finally {
      setLoadingMembers(false);
    }
  }, [roomId]);

  // 🔊 Toggle broadcast permission for a user (host/admin only)
  const handleToggleBroadcast = useCallback((userId, currentState) => {
    if (!isHost && !isAdmin) return;
    
    const messageType = currentState ? 'revoke_broadcast' : 'grant_broadcast';
    
    sendMessage({
      type: messageType,
      session_id: sessionStatus.id,
      user_id: userId
    });
  }, [isHost, isAdmin, sessionStatus.id, sendMessage]);

  // ❌ REMOVED: Don't fetch room members from API - use session members from WebSocket only
  // useEffect(() => {
  //   if (!roomId || !currentUser) return;
  //   fetchRoomMembers();
  // }, [roomId, currentUser, fetchRoomMembers]);

  // ✅ Audio toggle function - keeps track published, just toggles enabled (for activeSpeakersChanged)
  const toggleAudio = useCallback(async () => {
    console.log('🎤 [toggleAudio] Called, current state:', isAudioActive);
    console.log('🎤 [toggleAudio] BEFORE toggle - Track state:', {
      isAudioActive,
      isMutedByHost,
      trackEnabled: publishedAudioTrackRef.current?.enabled,
      trackIsMuted: publishedAudioTrackRef.current?.isMuted,
      trackExists: !!publishedAudioTrackRef.current
    });
    
    // ✅ Prevent unmuting if host has locked mute
    if (isMutedByHost && !isAudioActive) {
      console.log('🔒 [toggleAudio] Cannot unmute - host has locked mute');
      toast.error('Host has muted all members', {
        icon: '🔒',
        duration: 3000,
      });
      return;
    }
    
    const newAudioState = !isAudioActive;
    console.log('🎤 [toggleAudio] New state will be:', newAudioState);

    // ✅ Toggle audio track enabled state (track stays published to LiveKit)
    const audioTrack = publishedAudioTrackRef.current;
    if (!audioTrack) {
      console.warn('⚠️ [toggleAudio] No audio track published yet');
      console.warn('   LocalParticipant exists:', !!localParticipant);
      console.warn('   Selected audio device:', selectedAudioDeviceId);
      console.warn('   Mic permission:', hasMicPermission);
      
      // ✅ Show user-friendly error with actionable guidance
      if (!hasMicPermission) {
        alert('⚠️ Microphone not initialized yet.\n\nPlease:\n1. Allow microphone permission when prompted\n2. Wait a moment for audio to initialize\n3. Try unmuting again');
      } else {
        alert('⚠️ Audio is still initializing. Please wait a moment and try again.');
      }
      return;
    }

    // Toggle enabled state
    audioTrack.enabled = newAudioState;
    setIsAudioActive(newAudioState);
    
    console.log('✅ [toggleAudio] AFTER toggle - Track state:', {
      trackEnabled: audioTrack.enabled,
      trackIsMuted: audioTrack.isMuted,
      newAudioState
    });
    
    // ✅ Update local user's audio state for MembersModal
    setRemoteAudioStates(prev => ({
      ...prev,
      [currentUser.id]: {
        ...prev[currentUser.id],
        isMuted: !newAudioState,
        isSpeaking: false, // Will be updated by activeSpeakersChanged
        audioLevel: 0,
      }
    }));
    
    // Extract current user's row from userSeats
    const currentUserSeatId = userSeats[currentUser?.id];
    const currentUserRow = currentUserSeatId ? parseInt(currentUserSeatId.split('-')[0]) : null;
    
    // ✅ Check if user has broadcast permission
    const hasUserBroadcastPermission = broadcastPermissions[currentUser?.id] || false;
    const isGlobalBroadcast = (isHost && isHostBroadcasting) || hasUserBroadcastPermission;

    // 📡 Send real-time update over WebSocket for UI state sync
    sendMessage({
      type: "user_audio_state",
      isAudioActive: newAudioState,
      userId: currentUser.id,
      isSeatedMode: isSeatedMode,
      isGlobalBroadcast: isGlobalBroadcast,
      row: isSeatedMode && currentUserRow !== null ? currentUserRow : null,
    });
  }, [isAudioActive, isMutedByHost, currentUser?.id, isSeatedMode, isHost, isHostBroadcasting, userSeats, sendMessage, broadcastPermissions, localParticipant, selectedAudioDeviceId, hasMicPermission]);

  // ✅ Host/admin: Toggle mute all members (locked mute, requires host approval to unmute)
  const handleMuteAll = useCallback((exemptGuestId = null) => {
    if (!isHost && !isAdmin) {
      console.warn('🚫 [VideoWatch] Non-host/admin attempted to toggle mute all');
      return;
    }

    const newMuteState = !isMuteAllActive;
    console.log(`🔇 [VideoWatch] Host toggling mute all: ${newMuteState ? 'ON' : 'OFF'}`, { exemptGuestId });
    console.log('🔇 [VideoWatch] sendMessage exists:', !!sendMessage);
    console.log('🔇 [VideoWatch] currentUser.id:', currentUser?.id);
    console.log('🔇 [VideoWatch] sessionStatus?.id:', sessionStatus?.id);
    
    if (newMuteState) {
      // Muting all members (except exempt guest if provided)
      const message = {
        type: "mute_all_members",
        hostId: currentUser.id,
        sessionId: sessionStatus?.id,
        exemptGuestId: exemptGuestId, // 🆕 Pass guest ID to backend
      };
      console.log('🔇 [VideoWatch] Sending mute_all_members message:', message);
      sendMessage(message);

      setIsMuteAllActive(true);
      
      // Dynamic toast message
      const toastMsg = exemptGuestId 
        ? `All members muted except guest`
        : 'All members have been muted';
      
      toast.success(toastMsg, {
        icon: '🔇',
        duration: 3000,
      });
    } else {
      // Unmuting all members
      const message = {
        type: "unmute_all_members",
        hostId: currentUser.id,
        sessionId: sessionStatus?.id,
      };
      console.log('🔇 [VideoWatch] Sending unmute_all_members message:', message);
      sendMessage(message);

      setIsMuteAllActive(false);
      toast.success('All members can now unmute', {
        icon: '🔊',
        duration: 3000,
      });
    }
  }, [isHost, isAdmin, isMuteAllActive, sendMessage, currentUser, sessionStatus]);

  // ✅ Handle emote send (sound for sender, broadcast to all)
  const handleEmoteSend = useCallback((emoteData) => {
    const emoteId = emoteData.emote;
    
    // Map emote IDs to emojis
    const emoteMap = {
      'thumbs_up': '👍',
      'heart': '❤️',
      'laugh': '😂',
      'celebrate': '🎉',
      'fire': '🔥',
      'clap': '👏',
    };
    
    const emoji = emoteMap[emoteId] || '✨';
    
    // Play sound only for sender
    playEmoteSound(emoteId, 0.6);
    
    // Show floating emote for sender
    setLocalEmotes(prev => [...prev, { id: Date.now(), emoji }]);
    
    // Broadcast to all via WebSocket
    sendMessage({
      type: 'emote',
      userId: currentUser.id,
      username: currentUser.username,
      emote: emoteId,
      timestamp: Date.now()
    });
  }, [playEmoteSound, sendMessage, currentUser]);

  // ✅ Host/admin: Unmute a specific member
  const handleUnmuteMember = useCallback((targetUserId) => {
    if (!isHost && !isAdmin) {
      console.warn('🚫 [VideoWatch] Non-host/admin attempted to unmute member');
      return;
    }

    console.log(`🔊 [VideoWatch] Host unmuting member: ${targetUserId}`);
    
    sendMessage({
      type: "unmute_member",
      hostId: currentUser.id,
      targetUserId: targetUserId
    });

    // Auto-lower raised hand when unmuted
    setRaisedHands(prev => prev.filter(h => h.userId !== targetUserId));
    
    // Send hand_lowered message to sync with all clients
    sendMessage({
      type: "lower_hand",
      userId: targetUserId
    });

    toast.success(`Member unmuted`, {
      icon: '🔊',
      duration: 2000,
    });
  }, [isHost, isAdmin, sendMessage, currentUser]);

  // ✋ Toggle raise/lower hand
  const handleToggleRaiseHand = useCallback(() => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    
    if (newState) {
      // Raise hand
      const userSeatId = userSeats[currentUser.id] || 'N/A';
      sendMessage({
        type: "raise_hand",
        userId: currentUser.id,
        username: currentUser.username || currentUser.name,
        seatId: userSeatId
      });
      
      toast('✋ Hand raised', {
        icon: '✋',
        duration: 2000,
      });
    } else {
      // Lower hand
      sendMessage({
        type: "lower_hand",
        userId: currentUser.id
      });
      
      // ✅ Clear from local raised hands array to update notification count
      setRaisedHands(prev => prev.filter(h => h.userId !== currentUser.id));
      
      toast('Hand lowered', {
        icon: '👋',
        duration: 2000,
      });
    }
  }, [isHandRaised, sendMessage, currentUser, userSeats, setRaisedHands]);

  // detect if user stops sharing via browser controls
  useEffect(() => {
    if (!localParticipant) return;

    const handleTrackUnpublished = (pub) => {
      if (pub.source === 'screen_share') {
        setIsScreenSharingActive(false);
        setScreenSharerUserId(null);
        sendMessage({
          type: "update_room_status",
          data: {
            is_screen_sharing: false,
            screen_sharing_user_id: 0,
            currently_playing: "",
          }
        });
      }
    };

    localParticipant.on('trackUnpublished', handleTrackUnpublished);
    return () => {
      localParticipant.off('trackUnpublished', handleTrackUnpublished);
    };
  }, [localParticipant, sendMessage]);

  // Fetch private chat history when modal opens
  useEffect(() => {
    if (showPrivateChat && privateChatUser && !privateMessages[privateChatUser.id]?.length) {
      sendMessage({
        type: 'fetch_private_chat',
        data: { other_user_id: privateChatUser.id }
      });
    }
  }, [showPrivateChat, privateChatUser, sendMessage, privateMessages]);

  // ✅ IMMEDIATE TRACK SUBSCRIPTION: Listen for LiveKit tracks (camera/screen) - like LectureHall
  useEffect(() => {
    if (!room || !isLiveKitConnected) return;

    const handleTrackSubscribed = (track, publication, participant) => {
      console.log('🟢 [trackSubscribed] Track received:', {
        source: publication.source,
        kind: track.kind,
        participant: participant.identity
      });

      // Only handle video tracks for LiveShare
      if (track.kind !== 'video') return;

      // Handle screen share tracks
      if (publication.source === Track.Source.ScreenShare) {
        console.log('🖥️ [LiveShare] Screen share track subscribed from:', participant.identity);
        
        const screenStream = new MediaStream([track.mediaStreamTrack]);
        
        // Check if host also has camera track
        const cameraTrackPub = participant.getTrackPublication(Track.Source.Camera);
        let cameraStream = null;
        
        if (cameraTrackPub && cameraTrackPub.track) {
          cameraStream = new MediaStream([cameraTrackPub.track.mediaStreamTrack]);
          console.log('📹 [LiveShare] Host camera track also available');
        }
        
        setCurrentMedia({
          type: 'liveshare',
          title: `LiveShare (${liveShareContentMode || 'Screen Share'})`,
          stream: screenStream,
          cameraStream: cameraStream
        });
        
        return;
      }
      
      // Handle camera tracks for LiveShare
      if (publication.source === Track.Source.Camera) {
        console.log('✅ [LiveShare] Camera track subscribed from:', participant.identity);
        
        const cameraStream = new MediaStream([track.mediaStreamTrack]);
        
        // Check if host also has screen share track
        const screenTrackPub = participant.getTrackPublication(Track.Source.ScreenShare);
        let screenStream = null;
        
        if (screenTrackPub && screenTrackPub.track) {
          screenStream = new MediaStream([screenTrackPub.track.mediaStreamTrack]);
          console.log('🖥️ [LiveShare] Host screen share track also available');
        }
        
        // Determine mode based on what tracks are available
        const mode = screenStream && cameraStream ? 'both' : screenStream ? 'screen' : 'camera';
        
        console.log('🎬 [LiveShare] Displaying camera, mode:', mode);
        
        setCurrentMedia({
          type: 'liveshare',
          title: `LiveShare (${mode})`,
          stream: screenStream,
          cameraStream: cameraStream
        });
        
        setLiveShareMode(mode);
        setIsScreenSharingActive(true);
        
        return;
      }
    };

    room.on('trackSubscribed', handleTrackSubscribed);
    
    return () => {
      room.off('trackSubscribed', handleTrackSubscribed);
    };
  }, [room, isLiveKitConnected, liveShareContentMode]);

  // ✅ FIND SCREEN SHARE TRACK FROM LIVEKIT (MUST BE BEFORE EARLY RETURN)
  // Force useMemo recalculation when track count changes
  const remoteTrackCount = React.useMemo(() => {
    if (!room) return 0;
    let count = 0;
    room.remoteParticipants.forEach(p => {
      count += (p.videoTrackPublications?.size || 0);
    });
    return count;
  }, [room, remoteParticipants]);

  // 🎥 Track remote SCREEN share separately
  const remoteScreenTrack = React.useMemo(() => {
    if (!room) return null;
    
    const participants = Array.from(room.remoteParticipants.values());
    
    // Debug: Log all participants and their tracks
    if (selectedLiveShareLayout === 'split-view') {
      console.log('🔍 [SCREEN TRACK] Searching for screen share...', {
        participantCount: participants.length,
        participants: participants.map(p => ({
          identity: p.identity,
          videoTracks: Array.from(p.videoTrackPublications.values()).map(pub => ({
            source: pub.source,
            kind: pub.kind,
            subscribed: pub.isSubscribed
          }))
        }))
      });
    }
    
    const screenPub = participants
      .flatMap(p => Array.from(p?.videoTrackPublications?.values() || []))
      .find(pub => pub?.source === Track.Source.ScreenShare);
    
    if (selectedLiveShareLayout === 'split-view') {
      console.log('🔍 [SCREEN TRACK] Found:', !!screenPub);
    }
    
    return screenPub?.track || null;
  }, [room, remoteParticipants, remoteTrackCount, selectedLiveShareLayout]);

  // 📹 Track remote CAMERA separately
  const remoteCameraTrack = React.useMemo(() => {
    if (!room) return null;
    
    const participants = Array.from(room.remoteParticipants.values());
    const cameraPub = participants
      .flatMap(p => Array.from(p?.videoTrackPublications?.values() || []))
      .find(pub => pub?.source === Track.Source.Camera);
    
    if (selectedLiveShareLayout === 'split-view') {
      console.log('🔍 [CAMERA TRACK] Found:', !!cameraPub);
    }
    
    return cameraPub?.track || null;
  }, [room, remoteParticipants, remoteTrackCount, selectedLiveShareLayout]);

  // 🎨 SPLIT-VIEW DEBUG: Log what tracks are detected
  useEffect(() => {
    if (selectedLiveShareLayout === 'split-view') {
      console.log('🎨 [SPLIT-VIEW DEBUG] Track detection:', {
        layout: selectedLiveShareLayout,
        hasRemoteScreen: !!remoteScreenTrack,
        hasRemoteCamera: !!remoteCameraTrack,
        hasLocalScreen: !!localScreenTrack,
        hasLocalCamera: !!liveShareMode,
        mode: liveShareMode,
        isHost: isHost
      });
    }
  }, [selectedLiveShareLayout, remoteScreenTrack, remoteCameraTrack, localScreenTrack, liveShareMode, isHost]);

  // 🎥 Update currentMedia with BOTH camera and screen streams for split-view rendering
  useEffect(() => {
    // ✅ Skip if no active sharing session (LiveShare OR screen share)
    if (!liveShareContentMode && !liveShareMode && !isScreenSharingActive) return;
    
    // For MEMBERS/GUESTS
    if (!isHost && (liveShareContentMode || isScreenSharingActive)) {
      // CASE 1: Guest is sharing screen (has localScreenTrack) + viewing host camera (remoteCameraTrack)
      if (localScreenTrack?.track?.mediaStreamTrack && remoteCameraTrack?.mediaStreamTrack) {
        console.log('✅ [SPLIT-VIEW] Guest using own screen + host camera');
        // localScreenTrack is a LocalTrackPublication (for guest's own screen)
        // remoteCameraTrack is a RemoteTrack (for host's camera)
        const guestScreenStream = new MediaStream([localScreenTrack.track.mediaStreamTrack]);
        const hostCameraStream = new MediaStream([remoteCameraTrack.mediaStreamTrack]);
        
        setCurrentMedia({
          type: 'liveshare',
          title: `LiveShare (${liveShareContentMode || 'Camera'})`,
          stream: guestScreenStream,    // Guest's own screen
          cameraStream: hostCameraStream // Host's camera
        });
        return;
      }
      
      // Skip CASE 2 if we're HOST - HOST uses dedicated merge logic below
      if (isHost) return;
      
      // CASE 2: Regular member viewing host streams (camera-only, screen-only, or both)
      const screenStream = remoteScreenTrack ? new MediaStream([remoteScreenTrack.mediaStreamTrack]) : null;
      const cameraStream = remoteCameraTrack ? new MediaStream([remoteCameraTrack.mediaStreamTrack]) : null;
      
      console.log('📺 [MEMBER] Viewing host streams:', {
        hasScreen: !!screenStream,
        hasCamera: !!cameraStream,
        mode: liveShareContentMode || 'screen_share'
      });
      
      // ✅ Update currentMedia if we have at least one stream (works for camera/screen/both)
      if (screenStream || cameraStream) {
        setCurrentMedia({
          type: 'liveshare',
          title: `LiveShare (${liveShareContentMode || 'Camera'})`,
          stream: screenStream,      // null if camera-only ✅
          cameraStream: cameraStream  // null if screen-only ✅
        });
      }
    }
    
    // For HOST with active camera and guest screen joined
    if (isHost && liveShareMode && remoteScreenTrack) {
      const guestScreenStream = new MediaStream([remoteScreenTrack.mediaStreamTrack]);
      
      console.log('🎨 [HOST] Merging guest screen with host camera');
      
      // Preserve host's camera stream that was set in handleStartLiveShare
      setCurrentMedia(prev => ({
        type: 'liveshare',
        title: `LiveShare (${liveShareMode})`,
        stream: guestScreenStream,
        cameraStream: prev?.cameraStream
      }));
    }
  }, [remoteScreenTrack, remoteCameraTrack, localScreenTrack, liveShareContentMode, liveShareMode, isHost, isScreenSharingActive, selectedLiveShareLayout]);

  // 📹 Enrich participants with LiveKit camera tracks
  const participantsWithCamera = useMemo(() => {
    console.log('📹 [participantsWithCamera] useMemo recalculating...');
    console.log('📹 [participantsWithCamera] participants:', participants);
    console.log('📹 [participantsWithCamera] remoteParticipants:', remoteParticipants);
    
    return participants.map(participant => {
      console.log(`📹 [participantsWithCamera] Processing participant:`, participant);
      
      // If participant manually turned off camera (via WebSocket), respect that immediately
      if (participant.isCameraOn === false) {
        console.log(`⚠️ [participantsWithCamera] Camera manually disabled for user-${participant.id}`);
        return { ...participant, stream: null };
      }
      
      // Find matching LiveKit participant by identity (user-{id})
      const livekitParticipant = remoteParticipants.find(
        lp => lp.identity === `user-${participant.id}`
      );

      console.log(`📹 [participantsWithCamera] Looking for user-${participant.id}, found:`, !!livekitParticipant);

      if (!livekitParticipant) {
        return participant; // No LiveKit participant yet
      }

      // Check for camera track
      const videoTracks = Array.from(livekitParticipant.videoTrackPublications?.values() || []);
      console.log(`📹 [participantsWithCamera] Video tracks for user-${participant.id}:`, videoTracks.length);
      
      const cameraTrack = videoTracks.find(pub => pub.source === 'camera');
      console.log(`📹 [participantsWithCamera] Camera track for user-${participant.id}:`, cameraTrack);
      console.log(`📹 [participantsWithCamera] Track subscribed:`, cameraTrack?.subscribed);
      console.log(`📹 [participantsWithCamera] Track object:`, cameraTrack?.track);
      console.log(`📹 [participantsWithCamera] VideoTrack object:`, cameraTrack?.videoTrack);
      console.log(`📹 [participantsWithCamera] MediaStreamTrack:`, cameraTrack?.track?.mediaStreamTrack || cameraTrack?.videoTrack?.mediaStreamTrack);
      
      // Try both .track and .videoTrack (different LiveKit versions use different properties)
      const actualTrack = cameraTrack?.track || cameraTrack?.videoTrack;
      
      if (cameraTrack && cameraTrack.subscribed && actualTrack && actualTrack.mediaStreamTrack) {
        // Create MediaStream from the camera track
        const stream = new MediaStream([actualTrack.mediaStreamTrack]);
        console.log(`✅ [participantsWithCamera] Created camera stream for user-${participant.id}`, stream);
        return {
          ...participant,
          isCameraOn: true,
          stream: stream
        };
      } else {
        console.log(`⚠️ [participantsWithCamera] Camera track not ready for user-${participant.id}`, {
          hasPublication: !!cameraTrack,
          subscribed: cameraTrack?.subscribed,
          hasTrack: !!actualTrack,
          hasMediaStreamTrack: !!actualTrack?.mediaStreamTrack
        });
      }

      return participant;
    });
  }, [participants, remoteParticipants]);

  // Show loader while auth checks run
  if (authLoading) {
    return <AppSplash statusText="Loading your cinema experience..." />;
  }

  // Private chat handlers
  const sendPrivateMessage = (text) => {
    if (!privateChatUser || !text.trim() || !sendMessage) return;
    const msg = {
      type: 'private_chat_message',
      data: {
        to_user_id: privateChatUser.id,
        message: text.trim()
      }
    };
    sendMessage(msg);
    
    // ✅ Optimistic update: Add sent message immediately
    const optimisticMsg = {
      id: Date.now(),
      from_user_id: currentUser.id,
      to_user_id: privateChatUser.id,
      message: text.trim(),
      timestamp: Date.now(),
      _optimistic: true
    };
    setPrivateMessages(prev => ({
      ...prev,
      [privateChatUser.id]: [...(prev[privateChatUser.id] || []), optimisticMsg]
    }));
  };

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* ✅ Toast Notifications */}
      <Toaster position="top-center" />

      {/* Session Ended Overlay */}
      {sessionEndedInfo && (
        <SessionEndedOverlay
          reason={sessionEndedInfo.reason}
          onReturn={() => performCleanupAndExit(sessionEndedInfo.isTemporary || false)}
        />
      )}

      <NetworkQualityBanner quality={networkQuality} />

      {/* � Floating Emote Overlays (visible to sender only) */}
      {localEmotes.map(emote => (
        <FloatingEmoteOverlay
          key={emote.id}
          emoji={emote.emoji}
          onComplete={() => setLocalEmotes(prev => prev.filter(e => e.id !== emote.id))}
        />
      ))}
      
      {/* �🔇 Mute All Banner */}
      {showMuteAllBanner && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3">
            <span className="text-2xl">🔇</span>
            <span className="font-medium">Host has muted all members</span>
          </div>
        </div>
      )}
      
      {/* Top-Left Menu Icon */}
      <div className="absolute top-0 left-0 p-3 sm:p-4 z-50">
        <button
          onClick={() => setIsLeftSidebarOpen(prev => !prev)}
          className="h-10 w-10 sm:h-8 sm:w-8 p-1 touch-manipulation"
          aria-label={isLeftSidebarOpen ? "Close menu" : "Open menu"}
        >
          <img 
            src="/icons/MenuIcon.svg" 
            alt="Menu" 
            className={`h-full w-full transition-transform duration-300 ${isLeftSidebarOpen ? 'rotate-90' : ''}`}
          />
        </button>
      </div>

      {/* 📺 Main Video Player — PASS LIVEKIT TRACK */}
      <div 
        className="relative w-full h-full"
        onDoubleClick={handleDoubleClickLike}
      >
        {/* 📺 Ad Pre-roll disabled — uncomment below to re-enable */}
        {/* {showAdPreroll && (
          <AdVideoPreroll
            roomId={roomId}
            contentRating={room?.content_rating || 'general'}
            onComplete={() => setShowAdPreroll(false)}
          />
        )} */}

        {/* Main content (video player) */}

            {/* 🎯 Right-side push: video slides left to 80%, ad panel slides in from right */}
            <div className="flex flex-row h-full w-full overflow-hidden">
              {/* Video Player: shrinks to 80% width when ad is present, snaps back to full */}
              <div
                className="relative h-full transition-all duration-500 ease-in-out"
                style={{ width: bannerAdData ? '80%' : '100%' }}
              >
                <CinemaVideoPlayer
                  ref={videoPlayerRef}
                  mediaItem={currentMedia}
                  isPlaying={isPlaying}
                  isHost={isHost}
                  track={remoteScreenTrack}
                  localScreenTrack={localScreenTrack}
                  layout={selectedLiveShareLayout}
                  playbackPositionRef={playbackPositionRef}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onEnded={handleVideoEnd}
                  onError={handleError}
                  onPauseBroadcast={handlePauseBroadcast}
                  onTimeUpdate={handleTimeUpdate}
                />
              </div>

              {/* Banner Ad: slides in as right 20% panel, disappears when done */}
              <div
                className="h-full bg-black overflow-hidden transition-all duration-500 ease-in-out flex-shrink-0"
                style={{ width: bannerAdData ? '20%' : '0%' }}
              >
                {bannerAdData && (
                  <InSessionAdPanel
                    ad={bannerAdData}
                    fullscreen={false}
                    onComplete={() => {
                      setBannerAdData(null);
                    }}
                    onTrackImpression={async (clicked) => {
                      try {
                        await apiClient.post(`/api/ads/campaigns/${bannerAdData.id}/track`, {
                          session_id: sessionStatus?.id,
                          room_id: roomId,
                          clicked,
                          view_duration: 15
                        });
                      } catch (err) {
                        console.error('❌ [VideoWatch] Failed to track impression:', err);
                      }
                    }}
                  />
                )}
              </div>
            </div>
            
            {/* ❤️ TikTok Heart Animation */}
            {showHeartAnimation && (
              <TikTokHeartAnimation 
                onComplete={() => setShowHeartAnimation(false)}
              />
            )}
            
            {/* 📖 Bible Verse Overlay (Church mode) */}
            {isBibleVerseActive && currentBibleVerse && (
              <BibleOverlay 
                verse={currentBibleVerse}
                isActive={isBibleVerseActive}
                sendMessage={sendMessage}
                sessionId={urlSessionId}
                onDismiss={isHost ? () => {
                  setIsBibleVerseActive(false);
                  setCurrentBibleVerse(null);
                } : undefined}
              />
            )}
            
            {/* 🎵 Hymn Overlay (Church mode) */}
            {isHymnActive && currentHymn && (
              <HymnOverlay
                hymn={currentHymn}
                isActive={isHymnActive}
                currentVerse={currentHymnVerse}
                sendMessage={sendMessage}
                sessionId={urlSessionId}
                onDismiss={isHost ? () => {
                  setIsHymnActive(false);
                  setCurrentHymn(null);
                  setCurrentHymnVerse(1);
                } : undefined}
              />
            )}

            {/* 📜 Sermon Overlay (Church mode) */}
            {isSermonActive && sermonPages.length > 0 && (
              <SermonOverlay
                pages={sermonPages}
                currentPage={currentSermonPage}
                title={sermonTitle}
                isActive={isSermonActive}
                sendMessage={sendMessage}
                onDismiss={isHost ? () => {
                  setIsSermonActive(false);
                  setSermonPages([]);
                  setSermonTitle(null);
                  setCurrentSermonPage(0);
                } : undefined}
              />
            )}
            
            {/* 🎨 Graphics Canvas Overlay for LiveShare */}
            {/* Render canvas for HOST (liveShareMode) or MEMBER (liveShareContentMode) */}
            {(liveShareMode || liveShareContentMode) && (
              <canvas
                ref={graphicsCanvasRef}
                className="absolute inset-0 pointer-events-none"
                style={{ 
                  zIndex: 25,
                  width: '100%',
                  height: '100%'
                }}
              />
            )}

        {/* 🎙️ LiveShare Overlays (for Podcast/News/Show modes) */}
        {podcastConfig && (podcastConfig.mode === 'podcast' || podcastConfig.mode === 'news' || podcastConfig.mode === 'show') && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Host Name Label (top left) */}
            <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 pointer-events-auto">
              <span className="text-white font-medium text-sm sm:text-base">{podcastConfig.hostUsername || 'Host'} (Host)</span>
            </div>

            {/* Guest Name Label (top right) — only when a guest is active */}
            {podcastConfig.guestUserId && (() => {
              const guestMember = participants.find(p => p.id === podcastConfig.guestUserId);
              const guestLabel = guestMember?.username || guestMember?.name || `Guest #${podcastConfig.guestUserId}`;
              return (
                <div className="absolute top-4 right-4 bg-purple-900/80 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 pointer-events-auto">
                  <span className="text-purple-200 font-medium text-sm sm:text-base">{guestLabel} (Guest)</span>
                </div>
              );
            })()}
            
            {/* Breaking News Banner (DOM-based, full width, behind logo) */}
            {bannerState && (() => {
              // Use podcastConfig for logo position (kept in sync via WS)
              const logoY = podcastConfig.logoStyle?.y || 80;
              const logoSize = podcastConfig.logoStyle?.size || 100;

              // 📱 Responsive calculations based on screen size
              const responsiveScale = screenSize === 'mobile' ? 0.5 : screenSize === 'tablet' ? 0.75 : 1;
              const baseBannerHeight = bannerState.podcastLogoSize || 100;
              const bannerHeight = baseBannerHeight; // Always match logo size, no scaling
              const layout = bannerState.layout || 'bn';
              const bgColor = bannerState.style?.bgColor || '#DC2626';
              
              // Use pre-measured lines from state
              const currentLine = bannerTextLines[currentBannerLineIndex] || bannerState.text || '';
              
              // For breakin layout: get current and next line
              const line1 = bannerTextLines[currentBannerLineIndex] || bannerState.text || '';
              const line2 = bannerTextLines[(currentBannerLineIndex + 1) % bannerTextLines.length] || '';
              
              return (
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{
                    bottom: `${logoY}px`,
                    height: `${bannerHeight}px`,
                    backgroundColor: bgColor,
                    zIndex: 5, // Behind logo (logo is 10)
                    overflow: 'visible' // Allow BN.webp to extend beyond banner
                  }}
                >
                  {/* Layout: BN icon on right */}
                  {layout === 'bn' && (
                    <>
                      {/* Scrolling text - One line at a time - Full width */}
                      <div className="absolute inset-0 flex items-center justify-start" style={{
                        paddingLeft: `${logoSize + (screenSize === 'mobile' ? 10 : 20)}px` // Tighter gap on mobile
                      }}>
                        {screenSize === 'mobile' ? (
                          /* Mobile: 2 lines */
                          <div className="flex flex-col justify-center" style={{ width: '100%' }}>
                            <div 
                              style={{ 
                                fontSize: `${Math.max(14, bannerHeight * 0.4)}px`, // Smaller for 2 lines
                                lineHeight: `${Math.max(14, bannerHeight * 0.4) * 1.1}px`, // Comfortable spacing
                                fontFamily: "'Archivo Narrow', 'Roboto Condensed', 'Arial Narrow', sans-serif",
                                fontWeight: 500,
                                letterSpacing: '-0.05em',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'clip',
                                width: '100%',
                                color: bannerState.style?.textColor || '#FFFFFF'
                              }}
                            >
                              {bannerTextLines[currentBannerLineIndex] || currentLine}
                            </div>
                            <div 
                              style={{ 
                                fontSize: `${Math.max(14, bannerHeight * 0.4)}px`,
                                lineHeight: `${Math.max(14, bannerHeight * 0.4) * 1.1}px`,
                                fontFamily: "'Archivo Narrow', 'Roboto Condensed', 'Arial Narrow', sans-serif",
                                fontWeight: 500,
                                letterSpacing: '-0.05em',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'clip',
                                width: '100%',
                                color: bannerState.style?.textColor || '#FFFFFF'
                              }}
                            >
                              {bannerTextLines[(currentBannerLineIndex + 1) % bannerTextLines.length] || ''}
                            </div>
                          </div>
                        ) : (
                          /* Desktop: 1 line */
                          <div 
                            style={{ 
                              fontSize: `${Math.max(14, bannerHeight * 0.7)}px`, // Min 14px
                              lineHeight: `${bannerHeight}px`,
                              fontFamily: "'Roboto Condensed', 'Arial Narrow', sans-serif",
                              fontWeight: 700,
                              letterSpacing: 'normal',
                              whiteSpace: 'nowrap', // Single line
                              overflow: 'hidden',
                              textOverflow: 'clip', // No ellipsis, just clip at edge
                              width: '100%', // Fill available space to max width
                              color: bannerState.style?.textColor || '#FFFFFF'
                            }}
                            key={currentBannerLineIndex} // Force re-render on line change
                          >
                            {currentLine}
                          </div>
                        )}
                      </div>
                      
                      {/* BN icon on right - Absolutely positioned, doesn't affect text layout */}
                      <div style={{ 
                        position: 'absolute',
                        right: `${-70 + (bannerHeight * 3 * (screenSize === 'mobile' ? 0.80 : 1) * 0.06)}px`, // Moved left by 6%
                        bottom: `${bannerHeight * 3 * (screenSize === 'mobile' ? 0.80 : 1) * 0.04}px`, // Moved up by 4%
                        width: `${bannerHeight * 3 * (screenSize === 'mobile' ? 0.80 : 1)}px`, // 20% smaller on mobile only
                        height: `${bannerHeight * 3 * (screenSize === 'mobile' ? 0.80 : 1)}px` // 20% smaller on mobile only
                      }}>
                        <img 
                          src="/icons/BN.webp" 
                          alt="Breaking News"
                          className="object-contain"
                          style={{ 
                            width: '100%', 
                            height: '100%'
                          }}
                        />
                      </div>
                    </>
                  )}
                  
                  {/* Layout: Breakin icon on top-left */}
                  {layout === 'breakin' && (
                    <>
                      {/* Scrolling text - One line at a time - Full width */}
                      <div className="absolute inset-0 flex items-center justify-start" style={{
                        paddingLeft: `${logoSize + (screenSize === 'mobile' ? 10 : 20)}px`, // Tighter gap on mobile
                        paddingRight: screenSize === 'mobile' ? '0' : '20px' // No right padding on mobile
                      }}>
                        {screenSize === 'mobile' ? (
                          /* Mobile: 2 lines */
                          <div className="flex flex-col justify-center" style={{ width: '100%' }}>
                            <div 
                              style={{ 
                                fontSize: `${Math.max(14, bannerHeight * 0.4)}px`, // Smaller for 2 lines
                                lineHeight: `${Math.max(14, bannerHeight * 0.4) * 1.1}px`, // Comfortable spacing
                                fontFamily: "'Archivo Narrow', 'Roboto Condensed', 'Arial Narrow', sans-serif",
                                fontWeight: 500,
                                letterSpacing: '-0.05em',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'clip',
                                width: '100%',
                                color: bannerState.style?.textColor || '#FFFFFF'
                              }}
                            >
                              {bannerTextLines[currentBannerLineIndex] || currentLine}
                            </div>
                            <div 
                              style={{ 
                                fontSize: `${Math.max(14, bannerHeight * 0.4)}px`,
                                lineHeight: `${Math.max(14, bannerHeight * 0.4) * 1.1}px`,
                                fontFamily: "'Archivo Narrow', 'Roboto Condensed', 'Arial Narrow', sans-serif",
                                fontWeight: 500,
                                letterSpacing: '-0.05em',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'clip',
                                width: '100%',
                                color: bannerState.style?.textColor || '#FFFFFF'
                              }}
                            >
                              {bannerTextLines[(currentBannerLineIndex + 1) % bannerTextLines.length] || ''}
                            </div>
                          </div>
                        ) : (
                          /* Desktop: 1 line */
                          <div 
                            style={{ 
                              fontSize: `${Math.max(14, bannerHeight * 0.7)}px`, // Min 14px
                              lineHeight: `${bannerHeight}px`,
                              fontFamily: "'Roboto Condensed', 'Arial Narrow', sans-serif",
                              fontWeight: 700,
                              letterSpacing: 'normal',
                              whiteSpace: 'nowrap', // Single line
                              overflow: 'hidden',
                              textOverflow: 'clip', // No ellipsis, just clip at edge
                              width: '100%', // Fill available space to max width
                              color: bannerState.style?.textColor || '#FFFFFF'
                            }}
                            key={currentBannerLineIndex} // Force re-render on line change
                          >
                            {currentLine}
                          </div>
                        )}
                      </div>
                      
                      {/* Breakin icon - Positioned ABOVE the banner (bottom edge aligned to banner top) */}
                      <div style={{ 
                        position: 'absolute',
                        left: `-${bannerHeight * 3.15 * 0.05 * (screenSize === 'mobile' ? 0.6 : screenSize === 'tablet' ? 0.8 : 1)}px`, // Responsive negative margin
                        bottom: `-${bannerHeight * 3.15 * 0.10}px`, // Shifted down by 10% of logo height
                        width: `${bannerHeight * 3.15}px`, // Another 50% larger (2.1 * 1.5)
                        height: `${bannerHeight * 3.15}px` // Another 50% larger (2.1 * 1.5)
                      }}>
                        <img 
                          src="/icons/Breakin.webp" 
                          alt="Breaking"
                          className="object-contain"
                          style={{ 
                            width: '100%', 
                            height: '100%'
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            
            {/* Podcast Logo & Title (bottom left, side by side) - Hide title when banner is active */}
            {(podcastConfig.logoUrl || podcastConfig.title) && (() => {
              // Check if banner is active (now DOM-based)
              const isBannerActive = !!bannerState;
              
              const logoSize = podcastConfig.logoStyle?.size || 100;
              const logoX = podcastConfig.logoStyle?.x || 10;
              const logoY = podcastConfig.logoStyle?.y || 80;
              const titleColor = podcastConfig.titleStyle?.color || '#FFFFFF';
              const titleSize = podcastConfig.titleStyle?.size || 24;
              const titleWeight = podcastConfig.titleStyle?.weight || 700;
              const titleCase = podcastConfig.titleStyle?.case || 'none';
              
              const applyTextCase = (text, caseType) => {
                if (!text) return text;
                
                switch (caseType) {
                  case 'title':
                    return text.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
                  case 'upper':
                    return text.toUpperCase();
                  case 'lower':
                    return text.toLowerCase();
                  case 'sentence':
                    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
                  case 'none':
                  default:
                    return text;
                }
              };
              
              return (
                <div 
                  className="absolute flex items-center gap-3 pointer-events-auto"
                  style={{
                    left: `${logoX}px`,
                    bottom: `${logoY}px`,
                    zIndex: 10 // In front of banner (banner is z-index 5)
                  }}
                >
                  {/* Logo */}
                  {podcastConfig.logoUrl && (
                    <img 
                      src={podcastConfig.logoUrl} 
                      alt="Logo" 
                      className="object-contain"
                      style={{
                        width: `${logoSize}px`,
                        height: `${logoSize}px`
                      }}
                    />
                  )}
                  
                  {/* Title - Hide when banner is active */}
                  {podcastConfig.title && !isBannerActive && (
                    <div 
                      className="bg-black/70 backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow-xl"
                      style={{
                        color: titleColor,
                        fontSize: `${titleSize}px`,
                        fontWeight: titleWeight
                      }}
                    >
                      <h2 className="text-sm sm:text-base md:text-lg">{applyTextCase(podcastConfig.title, titleCase)}</h2>
                    </div>
                  )}
                </div>
              );
            })()}
            
            {/* LIVE Indicator (top center) */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full flex items-center gap-2 shadow-xl pointer-events-auto">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white font-bold text-xs sm:text-sm uppercase">LIVE</span>
            </div>
          </div>
        )}
      </div>

      {/* Viewer break overlay — ZZZ animation + countdown for static break source */}
      {isBreakActive && <LiveShareBreakOverlay timeRemaining={viewerBreakSeconds} />}

      {/* 🔊 Remote Audio Player - Handles audio from screen share */}
      {room && <RemoteAudioPlayer room={room} silenceMode={isSilenceMode} />}

      {/* Rest of UI (Taskbar, Sidebar, Chat, etc.) — UNCHANGED */}
      <Taskbar 
          watchType={watchType}
          classType={classType}
          authenticatedUserID={currentUser?.id}
          isAudioActive={isAudioActive}
          toggleAudio={toggleAudio}
          localAudioLevel={remoteAudioStates[currentUser?.id]?.audioLevel || 0}
          isSilenceMode={isSilenceMode}
          onToggleSilenceMode={() => setIsSilenceMode(!isSilenceMode)}
          showProgram={isClassroom} // Show Board button for classrooms
          showEmotes={true}
          onToggleRaiseHand={handleToggleRaiseHand}
          isHandRaised={isHandRaised}
          raisedHandsCount={raisedHands.length}
          onEmoteSend={handleEmoteSend}
          openChat={openChat}
          hasOpenModal={isLiveShareWizardOpen} // ✅ Prevent taskbar from showing during wizard
          onQuizClick={handleQuizClick}
          activeQuizCount={activeQuiz ? 1 : 0}
          isVisible={isVisible}
          isGlowing={isGlowing}
          onShareRoom={handleShareRoom}
          setIsGlowing={setIsGlowing}
          onLeaveCall={handleLeaveRoom}
          openVideoSidebar={() => setIsVideoSidebarOpen(prev => !prev)}
          isVideoSidebarOpen={isVideoSidebarOpen}
          isHost={isHost}
          isHostBroadcasting={isHostBroadcasting}
          onHostBroadcastToggle={() => setIsHostBroadcasting(prev => !prev)}
          isCameraOn={isCameraOn}
          toggleCamera={toggleCamera}
          onSeatsClick={handleSeatsClick}
          seats={seats}
          userSeats={userSeats}
          currentUser={currentUser}
          watchSessionMembers={roomMembers}
          isMembersLoading={!isMembersInitialized}
          onMembersClick={() => {
            // ✅ Don't fetch room members - use session members already in state from session_status WebSocket message
            console.log('👥 [VideoWatch] Members button clicked, current roomMembers:', roomMembers);
            console.log('👥 [VideoWatch] Members count:', roomMembers?.length);
            setShowMembersModal(true);
          }}
          audioDevices={audioDevices}
          selectedAudioDeviceId={selectedAudioDeviceId}
          onAudioDeviceChange={(deviceId) => {
            setSelectedAudioDeviceId(deviceId);
            if (isAudioActive) {
              publishMicDevice(deviceId);
            }
          }}
          availableCameras={availableCameras}
          selectedCameraId={selectedCameraId}
          onCameraSwitch={switchCamera}
          broadcastPermissions={broadcastPermissions}
          unreadMessages={unreadMessages}
        />

      {isSeatsModalOpen && (
        <SeatsModal 
          userSeats={userSeats}
          currentUser={currentUser}
          roomMembers={roomMembers}
          onClose={() => setIsSeatsModalOpen(false)}
          onTakeSeat={(row, col) => {
            const seatId = `${row}-${col}`;
            sendMessage({
              type: 'take_seat',
              seat_id: seatId,
              row,
              col,
              user_id: currentUser.id
            });
            setIsSeatsModalOpen(false);
          }}
          onSwapRequest={(targetUserId, targetSeat) => {
            sendMessage({
              type: 'seat_swap_request',
              requester_id: currentUser.id,
              target_user_id: targetUserId,
              target_seat: targetSeat
            });
          }}
        />
      )}

      {/* Seat Swap Request Notification Modal */}
      {seatSwapRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Seat Swap Request</h2>
            <p className="text-gray-300 mb-6">
              {seatSwapRequest.requester_name} wants to swap seats with you.
              They are requesting your seat at Row {seatSwapRequest.target_seat?.row}, 
              Column {seatSwapRequest.target_seat?.col}.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  sendMessage({
                    type: 'seat_swap_declined',
                    requester_id: seatSwapRequest.requester_id,
                    target_id: currentUser.id
                  });
                  setSeatSwapRequest(null);
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Decline
              </button>
              <button
                onClick={() => {
                  sendMessage({
                    type: 'seat_swap_accepted',
                    requester_id: seatSwapRequest.requester_id,
                    target_id: currentUser.id,
                    requester_seat: seatSwapRequest.requester_seat,
                    target_seat: seatSwapRequest.target_seat
                  });
                  setSeatSwapRequest(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {isLeftSidebarOpen && (
        <div className="left-sidebar" onClick={e => e.stopPropagation()}>
          <LeftSidebar
            roomId={roomId}
            mousePosition={mousePosition}
            isLeftSidebarOpen={isLeftSidebarOpen}
            onQuizClick={handleQuizClick}
            onGameClick={handleGameClick}
            watchType={watchType}
            classType={classType}
            isScreenSharingActive={isScreenSharingActive}
            sharingSource={sharingSource}
            isLiveKitConnected={isLiveKitConnected}
            onStartScreenShare={handleStartLiveShare}
            onEndScreenShare={handleEndScreenShare}
            onStartPlatformScreenShare={handleStartPlatformScreenShare}
            isConnected={isConnected}
            playlist={playlist}
            currentMedia={currentMedia}
            currentUser={currentUser}
            sendMessage={sendMessage}
            onDeleteMedia={onDeleteMedia}
            onMediaSelect={handleMediaSelect}
            onCameraPreview={setCameraPreviewStream}
            isHost={isHost || isAdmin}
            onClose={() => setIsLeftSidebarOpen(false)}
            onUploadComplete={fetchAndGeneratePosters}
            sessionId={activeSessionId}
            onSessionCleanup={(cleanup) => { leftSidebarCleanupRef.current = cleanup; }}
            // ✅ LiveShare props
            watchSessionMembers={participants}
            liveShareMode={liveShareMode}
            liveShareContentMode={liveShareContentMode}
            podcastConfig={podcastConfig}
            liveShareGuest={null}
            hasLiveSharePermission={hasLiveSharePermission}
            forceActiveTab={forceActiveTab}
            onLiveShareModeSelect={handleLiveShareModeSelect}
            onLiveShareTypeSelect={handleLiveShareTypeSelect}
            onGrantLiveSharePermission={() => {}}
            onRevokeLiveSharePermission={() => {}}
            onKickLiveShareGuest={() => {}}
            cameraShareTrackRef={cameraShareTrackRef}
            graphicsRendererRef={graphicsRendererRef}
            onWizardStateChange={setIsLiveShareWizardOpen}
            availableCameras={availableCameras}
            selectedCameraId={selectedCameraId}
            onCameraSwitch={switchCamera}
            isSessionPrivate={sessionStatus?.is_private || false}
            sessionStatus={sessionStatus}
            autoOpenGuestInvite={guestInviteAutoTrigger}
            onGuestInviteConsumed={() => setGuestInviteAutoTrigger(null)}
          />
        </div>
      )}

      {/* Other UI components (Chat, Camera Preview, Video Tiles, Modals, etc.) — keep as-is */}
      {selectedPlatform && (
        <div 
          className="fixed left-4 right-4 sm:left-80 sm:right-auto top-1/2 transform -translate-y-1/2 sm:w-80 z-40"
          style={{ maxWidth: 'calc(100vw - 2rem)' }}
        >
          <div className="bg-gray-800/90 p-3 sm:p-4 rounded-lg border border-gray-700">
            <h4 className="font-medium text-white mb-2">Selected: {selectedPlatform.name}</h4>
            <p className="text-gray-300 text-sm mb-3">
              Start screen sharing to watch {selectedPlatform.name} together.
            </p>
            <button
              onClick={() => {
                const url = selectedPlatform?.url;
                if (url) {
                  window.open(url, '_blank');
                  alert('Now start screen sharing from your browser!');
                }
              }}
            >
              🌐 Open {selectedPlatform?.name}
            </button>
          </div>
        </div>
      )}

      {isVideoSidebarOpen && (
        <VideoSidebar 
          participants={participants}
          localStream={localStream} 
        />
      )}

      {notifications.map(notification => (
        <SeatSwapNotification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
        />
      ))}

      {/* TikTok-Style Floating Chat */}
      {isChatOpen && (
        <div 
          className="fixed bottom-20 sm:bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-black/80 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl z-50 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-3 border-b border-gray-700">
            <h3 className="text-white font-medium">Watch Party Chat</h3>
            <button 
              onClick={() => setIsChatOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>

        {/* Messages */}
        <div className="h-64 overflow-y-auto p-3 space-y-2">
          {isChatLoading ? (
            <div className="text-gray-400 text-center py-4">Loading chat...</div>
          ) : sessionChatMessages.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-4">
              Be the first to chat!
            </div>
          ) : (
            sessionChatMessages.map((msg) => (
              // ✅ Wrap message in a "group" for hover targeting → moved outside JSX
              <div key={msg.ID} className="text-white text-sm group">
                <div>
                  <span className="font-medium text-purple-300">
                    {msg.Username || `User${msg.UserID}`}:
                  </span>{' '}
                  <span>{msg.Message}</span>
                </div>

                {/* Reactions (aggregated) — always visible */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {Object.entries(
                      (msg.reactions || []).reduce((acc, r) => {
                        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className="text-lg bg-gray-700/50 px-2 py-0.5 rounded-full flex items-center gap-0.5 cursor-pointer"
                        onClick={() => handleReactToMessage(msg.ID, emoji)}
                      >
                        {emoji} <span className="text-xs">{count > 1 ? count : ''}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Quick Reaction Buttons — hover-only */}
                <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {['❤️', '😂', '👍'].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReactToMessage(msg.ID, emoji)}
                      className="text-lg hover:bg-gray-600 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={newSessionMessage}
              onChange={(e) => setNewSessionMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-gray-800/50 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
              onKeyPress={(e) => e.key === 'Enter' && handleSendSessionMessage()}
            />
            <button
              onClick={handleSendSessionMessage}
              disabled={!newSessionMessage.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
        
      )}

      <CameraPreview stream={cameraPreviewStream} />

      {/* LiveKit VideoTiles handles all remote participant video/camera display */}
      <VideoTiles 
        participants={participantsWithCamera} 
        userSeat={userSeats[currentUser?.id]} 
        isSeatedMode={isSeatedMode}
        localStream={cameraPreviewStream}
        currentUser={currentUser}
        speakingUsers={speakingUsers}
      />

      {showCinemaSeatView && (
        <CinemaSeatView onClose={() => setShowCinemaSeatView(false)} />
      )}

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareUrl}
      />

      <MembersModal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        members={roomMembers}
        fetchMembers={null}
        onMemberClick={(member) => {
          setShowMembersModal(false);
          setPrivateChatUser(member);
          setShowPrivateChat(true);
          
          // ✅ Mark messages from this user as read
          setUnreadMessages(prev => ({
            ...prev,
            [member.id]: 0
          }));
        }}
        isHost={isHost || isAdmin}
        currentUserId={currentUser?.id}
        audioStates={remoteAudioStates}
        broadcastPermissions={broadcastPermissions}
        onToggleBroadcast={handleToggleBroadcast}
        userSeats={userSeats}
        sessionId={sessionStatus.id}
        userTheaters={{}}
        onRequestBroadcast={null}
        broadcastRequests={[]}
        watchType="video_watch"
        contentRating={contentRating}
        onMuteAll={handleMuteAll}
        isMuteAllActive={isMuteAllActive}
        onUnmuteMember={handleUnmuteMember}
        raisedHands={raisedHands}
        liveShareGuestId={liveShareGuestId}
        memberEmotes={memberEmotes}
      />
      {/* Chat Entry Modals */}
      {showChatHome && (
        <ChatHomeModal
          roomId={roomId}
          currentUser={currentUser}
          roomMembers={roomMembers}
          privateMessages={privateMessages}
          unreadMessages={unreadMessages}
          onClose={() => setShowChatHome(false)}
          onOpenRoomChat={() => {
            setShowChatHome(false);
            setIsChatOpen(true);
          }}
          onOpenPrivateChat={(user) => {
            setShowChatHome(false);
            setPrivateChatUser(user);
            setShowPrivateChat(true);
            
            // ✅ Mark messages from this user as read
            setUnreadMessages(prev => ({
              ...prev,
              [user.id]: 0
            }));
          }}
        />
      )}

      {showPrivateChat && privateChatUser && (
        <PrivateChatModal
          otherUser={privateChatUser}
          messages={privateMessages[privateChatUser.id] || []}
          onSendMessage={sendPrivateMessage}
          currentUser={currentUser}
          onBack={() => {
            setShowPrivateChat(false);
            setShowChatHome(true);
          }}
          onClose={() => setShowPrivateChat(false)}
          onMarkAsRead={(userId) => {
            setUnreadMessages(prev => ({
              ...prev,
              [userId]: 0
            }));
          }}
        />
      )}

      {/* 🎁 Floating Gift Icon - Only shows for non-hosts */}
      <FloatingGiftIcon
        hostId={sessionStatus?.hostId || roomHostId}
        currentUserId={currentUser?.id}
        tokenBalance={tokenBalance}
        isVisible={!showCinemaSeatView}
        isFullscreen={showCinemaSeatView}
        isLeftSidebarOpen={isLeftSidebarOpen}
        contentRating={contentRating}
        onGiftSent={(updatedBalance) => {
          console.log('🎁 [FloatingGiftIcon] Gift sent! New balance:', updatedBalance);
          setTokenBalance(updatedBalance.token_balance);
        }}
      />

      {/* 🎊 Donation Notifications - Visible to ALL users (including host) */}
      <DonationNotification
        messages={messages}
        currentUserId={currentUser?.id}
        contentRating={contentRating}
      />

      {/* 📝 QUIZ SYSTEM MODALS */}
      {isQuizManagementOpen && (isHost || isAdmin) && (
        <QuizManagementModal
          isOpen={isQuizManagementOpen}
          onClose={() => setIsQuizManagementOpen(false)}
          isHost={isHost || isAdmin}
          quizzes={quizzes}
          activeQuiz={activeQuiz}
          onCreateQuiz={handleCreateQuiz}
          onViewResults={handleViewResults}
          sendMessage={sendMessage}
          currentUser={currentUser}
        />
      )}

      {isMakeQuizOpen && (isHost || isAdmin) && (
        <MakeQuizModal
          isOpen={isMakeQuizOpen}
          onClose={() => {
            setIsMakeQuizOpen(false);
            setIsQuizManagementOpen(true); // Return to management
          }}
          sendMessage={sendMessage}
          currentUser={currentUser}
          roomId={roomId}
          sessionId={sessionStatus?.id}
        />
      )}

      {isTakeQuizOpen && !isHost && (
        <TakeQuizModal
          isOpen={isTakeQuizOpen}
          onClose={() => setIsTakeQuizOpen(false)}
          quiz={currentQuizData}
          sendMessage={sendMessage}
          currentUser={currentUser}
        />
      )}

      {isQuizResultsOpen && !isHost && (
        <QuizResultsModal
          isOpen={isQuizResultsOpen}
          onClose={() => setIsQuizResultsOpen(false)}
          results={quizResults}
          quiz={currentQuizData}
        />
      )}

      {/* 🎮 GAME SYSTEM MODALS */}
      {isGameLobbyOpen && (isHost || isAdmin) && (
        <GameLobbyModal
          isOpen={isGameLobbyOpen}
          onClose={() => setIsGameLobbyOpen(false)}
          roomMembers={[
            { id: currentUser?.id, username: currentUser?.username },
            ...participants.map(p => ({
              id: p.id,
              username: p.username || p.name
            }))
          ].filter(m => m.id)}
          currentUserId={currentUser?.id}
          onStartGame={handleStartGame}
        />
      )}

      {activeGame && (
        <GameOverlay
          activeGame={activeGame}
          currentUserId={currentUser?.id}
          onMove={handleGameMove}
          onClose={handleGameClose}
          webSocketService={{ on: () => {}, off: () => {} }} // Handled via messages array
        />
      )}

    </div>
  );
}