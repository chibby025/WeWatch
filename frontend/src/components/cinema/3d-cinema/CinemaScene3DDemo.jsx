// src/components/cinema/3d-cinema/CinemaScene3DDemo.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '../../../hooks/useAuth';
import useWebSocket from '../../../hooks/useWebSocket';
import { getChatHistory } from '../../../services/api';
import apiClient from '../../../services/api';
import { hasTicketCache, clearTicketCache } from '../../../utils/ticketCache';
import CinemaScene3D from './CinemaScene3D';
import Taskbar from '../../Taskbar';
import LeftSidebar from '../ui/LeftSidebar';
import MembersModal from '../../MembersModal';
import TheaterOverviewModal from '../../TheaterOverviewModal';
import CinemaSeatGridModal from './ui/CinemaSeatGridModal';
import AudioModeBar from './ui/AudioModeBar'; // 🎤 Audio mode toggle bar
import CinemaVideoPlayer from '../ui/CinemaVideoPlayer';
import useLiveKitRoom from "../../../hooks/useLiveKitRoom"; // LiveKit room hook
import useCinemaAudio from "../../../hooks/useCinemaAudio"; // 🎤 Cinema audio hook
import { Track, ParticipantEvent, RoomEvent, LocalVideoTrack } from 'livekit-client';
import { getTemporaryMediaItemsForRoom, getSessionTemporaryMedia, getFriendshipStatus, sendFriendRequest, getFriendsList, getPendingFriendRequests, getSentFriendRequests } from '../../../services/api';
import { useSeatController } from './useSeatController';
import { useLocation } from 'react-router-dom';
import { assignUserToSeat } from './seatCalculator';
import { useSeatSwap } from '../../../hooks/useSeatSwap';
// Add near the top with other imports
import UserProfileModal from "../../../components/UserProfileModal";
import PrivateChatModal from "../../../components/PrivateChatModal";
import ChatHomeModal from '../../ChatHomeModal';
import useEmoteSounds from '../../../hooks/useEmoteSounds';
import RemoteAudioPlayer from '../ui/RemoteAudioPlayer';
import FloatingGiftIcon from '../../FloatingGiftIcon';
import DonationNotification from '../../DonationNotification';
import axios from 'axios';
import { useMobile } from '../../../hooks/useMobile';
import TouchViewControls from './TouchViewControls';
import MobileCinemaTutorial from './MobileCinemaTutorial';
import RotateDevicePrompt from './RotateDevicePrompt';
import CinemaLoadingOverlay from './CinemaLoadingOverlay';
// Game system components
import GameLobbyModal from '../../Games/GameLobbyModal';
import GameOverlay from '../../Games/GameOverlay';
import GameScreenRenderer from '../../Games/GameScreenRenderer'; // ✅ NEW
import VolumeControl from '../../VolumeControl';
// LocalStorage cache utilities
import { 
  getCachedUser, 
  cacheUserData, 
  getCachedCinemaSeats, 
  cacheCinemaSeats,
  cacheLastSession 
} from '../../../utils/cinemaCache';

// LiveShare Fullscreen Component - Uses MediaStream objects (same pattern as PositionCalculatorPage)
function LiveShareFullscreenCinema({ stream, cameraStream, liveShareMode, podcastConfig }) {
  const videoRef = useRef();
  const cameraVideoRef = useRef();
  
  console.log('🎬 [LiveShareFullscreen] Component rendered:', {
    hasStream: !!stream,
    hasCameraStream: !!cameraStream,
    liveShareMode,
    podcastConfig
  });
  
  // 🎙️ Podcast mode uses HTML overlays for fullscreen (lighter weight)
  const isPodcastMode = podcastConfig?.mode === 'podcast';
  
  // Attach screen share stream to video element
  useEffect(() => {
    if (stream && videoRef.current && liveShareMode !== 'camera') {
      console.log('🎥 [LiveShareFullscreen] Attaching screen stream');
      
      // 🔥 Low-latency optimizations
      videoRef.current.setAttribute('preload', 'none');
      videoRef.current.setAttribute('disablePictureInPicture', 'true');
      if (videoRef.current.webkitSetPresentationMode) {
        videoRef.current.webkitSetPresentationMode('inline');
      }
      
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => console.error('❌ Screen play error:', err));
    }
  }, [stream, liveShareMode]);
  
  // Attach camera stream to video element
  useEffect(() => {
    if (cameraStream && cameraVideoRef.current) {
      console.log('📹 [LiveShareFullscreen] Attaching camera stream');
      
      // 🔥 Low-latency optimizations
      cameraVideoRef.current.setAttribute('preload', 'none');
      cameraVideoRef.current.setAttribute('disablePictureInPicture', 'true');
      if (cameraVideoRef.current.webkitSetPresentationMode) {
        cameraVideoRef.current.webkitSetPresentationMode('inline');
      }
      
      cameraVideoRef.current.srcObject = cameraStream;
      cameraVideoRef.current.play().catch(err => console.error('❌ Camera play error:', err));
    }
  }, [cameraStream]);
  
  const cameraContainerClass = liveShareMode === 'camera' 
    ? "w-full h-full flex items-center justify-center"
    : "absolute top-8 right-8 w-80 h-45 rounded-lg overflow-hidden shadow-2xl border-2 border-white/20";
  
  return (
    <>
      {/* Main screen share video (hidden in camera-only mode) */}
      {stream && liveShareMode !== 'camera' && !isPodcastMode && (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
        />
      )}
      
      {/* 🎙️ PODCAST MODE: Show video with HTML overlays */}
      {isPodcastMode && cameraStream && (
        <div className="w-full h-full flex items-center justify-center bg-black relative">
          {/* Host Camera - Full screen */}
          <video
            ref={cameraVideoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
          />
          
          {/* Host Name Label (top left) */}
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2">
            <span className="text-white font-medium">{podcastConfig.hostUsername || 'Host'} (Host)</span>
          </div>
          
          {/* Podcast Logo (bottom left above title) - load position and size from localStorage */}
          {podcastConfig.logoUrl && (() => {
            // Load custom logo styles from localStorage
            let logoSize = 100; // Default size
            let logoX = 10; // Default X position
            let logoY = 80; // Default Y position (from bottom)
            
            try {
              const savedLogoStyles = localStorage.getItem(`podcast_logo_style_${podcastConfig.sessionId || sessionId}`);
              if (savedLogoStyles) {
                const styles = JSON.parse(savedLogoStyles);
                logoSize = styles.size || 100;
                logoX = styles.x || 10;
                logoY = styles.y || 80;
              }
            } catch (err) {
              console.warn('Failed to load logo styles:', err);
            }
            
            return (
              <img 
                src={podcastConfig.logoUrl} 
                alt="Podcast Logo" 
                className="absolute object-contain"
                style={{
                  width: `${logoSize}px`,
                  height: `${logoSize}px`,
                  left: `${logoX}px`,
                  bottom: `${logoY}px`
                }}
              />
            );
          })()}
          
          {/* LIVE Indicator (top center) */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 px-4 py-2 rounded-full flex items-center gap-2 shadow-xl">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-white font-bold text-sm uppercase">LIVE</span>
          </div>
          
          {/* Podcast Title (bottom left with custom styling) */}
          {podcastConfig.title && (() => {
            // Load custom styles from localStorage
            let titleColor = '#FFFFFF';
            let titleSize = 24;
            let titleWeight = 700;
            let titleCase = 'none';
            
            try {
              const savedStyles = localStorage.getItem(`podcast_title_style_${podcastConfig.sessionId || sessionId}`);
              if (savedStyles) {
                const styles = JSON.parse(savedStyles);
                titleColor = styles.color || '#FFFFFF';
                titleSize = styles.size || 24;
                titleWeight = styles.weight || 700;
                titleCase = styles.case || 'none';
              }
            } catch (err) {
              console.warn('Failed to load title styles:', err);
            }
            
            // Apply text case transformation
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
                className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg shadow-xl"
                style={{
                  color: titleColor,
                  fontSize: `${titleSize}px`,
                  fontWeight: titleWeight
                }}
              >
                <h2>{applyTextCase(podcastConfig.title, titleCase)}</h2>
              </div>
            );
          })()}
        </div>
      )}
      
      {/* Camera video - fullscreen in camera mode, PiP in both mode (non-podcast) */}
      {!isPodcastMode && cameraStream && (
        <div className={cameraContainerClass}>
          <video
            ref={cameraVideoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted={liveShareMode !== 'camera'}
          />
        </div>
      )}
    </>
  );
}

export default function CinemaScene3DDemo() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation(); // 👈 get navigation state
  // === Derive host status ===
  const { 
    isHost: isHostFromState = false, 
    sessionId: sessionIdFromState, 
    currentUser: passedCurrentUser,
    showLoadingOverlay: enableLoadingOverlay = false // 🎬 Loading overlay flag from RoomPageNew
  } = location.state || {};
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get('session_id');
  const finalSessionId = sessionIdFromState || sessionIdFromUrl;
  
  // ✅ OPTIMIZATION: Get currentUser from navigation state if available (from RoomPage)
  // This eliminates the async loading delay and timing issues with session_status arriving first
  const { currentUser: hookCurrentUser, wsToken, loading: authLoading, refreshUser } = useAuth();
  const currentUser = passedCurrentUser || hookCurrentUser; // Use passed user immediately, fall back to hook
  
  // Log optimization status
  useEffect(() => {
    if (passedCurrentUser) {
      console.log('✨ [CinemaScene3DDemo] currentUser provided via navigation state - no loading delay!');
    } else {
      console.log('⏳ [CinemaScene3DDemo] currentUser loading via useAuth hook (direct URL access)');
    }
  }, [passedCurrentUser]);
  
  // 🐛 DEBUG: Track component mounts/remounts
  const componentIdRef = useRef(`cinema-${Date.now()}-${Math.random()}`);
  const mountCountRef = useRef(0);
  
  // 📋 LOG CAPTURE SYSTEM (like VideoWatch pattern)
  useEffect(() => {
    // Initialize captured logs array
    if (!window.capturedLogs) {
      window.capturedLogs = [];
    }
    
    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    // Intercept console.log
    console.log = (...args) => {
      window.capturedLogs.push({
        type: 'log',
        timestamp: Date.now(),
        time: new Date().toISOString(),
        args: args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch {
            return '[Circular or Complex Object]';
          }
        })
      });
      // Keep only last 500 logs to prevent memory issues
      if (window.capturedLogs.length > 500) {
        window.capturedLogs = window.capturedLogs.slice(-500);
      }
      originalLog.apply(console, args);
    };
    
    // Intercept console.warn
    console.warn = (...args) => {
      window.capturedLogs.push({
        type: 'warn',
        timestamp: Date.now(),
        time: new Date().toISOString(),
        args: args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch {
            return '[Circular or Complex Object]';
          }
        })
      });
      if (window.capturedLogs.length > 500) {
        window.capturedLogs = window.capturedLogs.slice(-500);
      }
      originalWarn.apply(console, args);
    };
    
    // Intercept console.error
    console.error = (...args) => {
      window.capturedLogs.push({
        type: 'error',
        timestamp: Date.now(),
        time: new Date().toISOString(),
        args: args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch {
            return '[Circular or Complex Object]';
          }
        })
      });
      if (window.capturedLogs.length > 500) {
        window.capturedLogs = window.capturedLogs.slice(-500);
      }
      originalError.apply(console, args);
    };
    
    console.log('📋 [CinemaScene3DDemo] Log capture system initialized');
    
    // Restore original console methods on unmount
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);
  
  useEffect(() => {
    mountCountRef.current++;
    console.log(`🎬 [CinemaScene3DDemo] MOUNT #${mountCountRef.current}`, {
      componentId: componentIdRef.current,
      roomId,
      sessionId: finalSessionId,
      currentUserId: currentUser?.id,
      timestamp: new Date().toISOString()
    });
    
    return () => {
      console.log(`🎬 [CinemaScene3DDemo] UNMOUNT`, {
        componentId: componentIdRef.current,
        mountCount: mountCountRef.current
      });
    };
  }, []);
  const stableTokenRef = useRef(null);
  const [showSeatMarkers, setShowSeatMarkers] = useState(false);
  
  // 🎯 Position Calculator Modal state
  const [showPositionCalculator, setShowPositionCalculator] = useState(false);
  
  // 🎬 Seat Preview Modal state
  const [showSeatPreview, setShowSeatPreview] = useState(false);
  const [previewSeatId, setPreviewSeatId] = useState(1);
  const [previewViewType, setPreviewViewType] = useState('center'); // 'left', 'center', 'right'
  const [cinemaSeats, setCinemaSeats] = useState({ seats: [] });
  const [selectedSeatId, setSelectedSeatId] = useState(1);
  const [currentCameraPos, setCurrentCameraPos] = useState([0, 0, 0]);
  const [currentCameraLookAt, setCurrentCameraLookAt] = useState([0, 0, 0]);
  const [viewLockedBeforeCalculator, setViewLockedBeforeCalculator] = useState(true);
  
  // 📋 Log Export Function
  const handleExportLogs = useCallback(() => {
    try {
      const logs = window.capturedLogs || [];
      if (logs.length === 0) {
        toast.warn('No logs captured yet');
        return;
      }
      
      // Format logs as readable text
      const logText = logs.map(log => {
        const timestamp = new Date(log.timestamp).toISOString();
        const type = log.type.toUpperCase();
        const message = log.args.join(' ');
        return `[${timestamp}] [${type}] ${message}`;
      }).join('\n');
      
      // Copy to clipboard
      navigator.clipboard.writeText(logText).then(() => {
        toast.success(`✅ Copied ${logs.length} logs to clipboard!`, {
          duration: 2000
        });
        console.log('📋 [LOG EXPORT] Exported', logs.length, 'logs');
      }).catch(err => {
        console.error('❌ [LOG EXPORT] Failed to copy:', err);
        toast.error('Failed to copy logs');
      });
    } catch (err) {
      console.error('❌ [LOG EXPORT] Error:', err);
      toast.error('Error exporting logs');
    }
  }, []);
  
  // 📷 Camera view cycling state
  const [currentCameraView, setCurrentCameraView] = useState('center'); // 'left', 'center', 'right'
  const [showCameraArrows, setShowCameraArrows] = useState(true);
  const cameraArrowTimeoutRef = useRef(null);
  
  // === State ===
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sessionChatMessages, setSessionChatMessages] = useState([]);
  const [newSessionMessage, setNewSessionMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isTheaterOverviewOpen, setIsTheaterOverviewOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [isSeatedMode] = useState(true); // ✅ Always enabled in 3D cinema - row-based audio by default
  const [userSeats, setUserSeats] = useState({});
  
  // Debug userSeats changes (show member names, not just IDs)
  useEffect(() => {
    const realUsers = Object.keys(userSeats).filter(k => !k.startsWith('demo-'));
    if (realUsers.length > 0) {
      const seatedInfo = realUsers.map(id => {
        const member = roomMembers.find(m => m.id === parseInt(id));
        const name = member?.username || `ID${id}`;
        return `${name}→${userSeats[id]}`;
      }).join(', ');
      console.log(`🪑 [SEATS] ${realUsers.length}/${roomMembers.length} members seated: ${seatedInfo}`);
    }
  }, [userSeats]);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isHostBroadcasting, setIsHostBroadcasting] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(null);
  const chatEndRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const [isViewLocked, setIsViewLocked] = useState(true);   // ✅ ADD THIS
  const [lightsOn, setLightsOn] = useState(true);          // ✅ ADD THIS
  const [darknessLevel, setDarknessLevel] = useState('regular'); // 'regular' | 'extreme'
  const [isSeatGridModalOpen, setIsSeatGridModalOpen] = useState(false);
  const [outgoingSwapRequest, setOutgoingSwapRequest] = useState(null); // { targetUserId, targetSeatId }
  const [showChatHome, setShowChatHome] = useState(false);
  
  // 🎬 Loading overlay state
  const [loadingStatus, setLoadingStatus] = useState(enableLoadingOverlay ? 'connecting' : null); // 'connecting' | 'finding_seat' | 'loading_scene' | null
  const [hasSeatAssigned, setHasSeatAssigned] = useState(false);
  const [isInitialSeatRequest, setIsInitialSeatRequest] = useState(true); // Track if this is first seat request (show spinner) vs seat change (no spinner)
  
  
  // 🔇 Silence mode state
  const [isSilenceMode, setIsSilenceMode] = useState(false);
  
  // 💬 Chat bubble visibility preference (persisted in localStorage)
  const [showChatBubbles, setShowChatBubbles] = useState(() => {
    const saved = localStorage.getItem('cinema_show_chat_bubbles');
    return saved === null ? true : saved === 'true'; // Default: ON
  });
  
  // Save chat bubble preference to localStorage
  useEffect(() => {
    localStorage.setItem('cinema_show_chat_bubbles', showChatBubbles.toString());
  }, [showChatBubbles]);
  
  // 🎵 Audio mode state (host-controlled, persisted across refreshes)
  const [audioMode, setAudioMode] = useState(() => {
    const saved = sessionStorage.getItem(`cinema_audio_mode_${roomId}`);
    return saved || 'seat'; // Default: seat mode
  });
  
  // ✅ Session membership confirmation (prevents LiveKit 403 race condition)
  const [isSessionMemberConfirmed, setIsSessionMemberConfirmed] = useState(false);

  // LiveShare state
  //const [liveShareMode, setLiveShareMode] = useState('regular');
  const [liveShareGuest, setLiveShareGuest] = useState(null);
  const [hasLiveSharePermission, setHasLiveSharePermission] = useState(false);
  const [watchSessionMembers, setWatchSessionMembers] = useState([]);
  
  // 🎫 Ticket enforcement - check on mount for paid sessions
  useEffect(() => {
    const checkTicket = async () => {
      if (!finalSessionId || !currentUser) return;
      
      try {
        // Get session details to check if ticketing is enabled
        const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
        const sessionDetails = response.data;
        
        if (!sessionDetails || sessionDetails.session_id !== finalSessionId) {
          console.log('❌ [CinemaScene3D] Session not found or mismatch');
          return;
        }
        
        const isUserHost = currentUser.id === sessionDetails.host_id;
        
        if (sessionDetails.ticketing_enabled && !isUserHost) {
          console.log('🎟️ [CinemaScene3D] Paid session detected, checking ticket...');
          
          // Check cache first
          if (!hasTicketCache(sessionDetails.id)) {
            console.log('❌ [CinemaScene3D] No ticket found - redirecting to room page');
            toast.error('This is a paid session. Please purchase a ticket.');
            navigate(`/rooms/${roomId}?openTicketModal=true`);
            return;
          }
          
          console.log('✅ [CinemaScene3D] Ticket verified in cache');
        }
      } catch (err) {
        console.error('❌ [CinemaScene3D] Failed to check ticket:', err);
      }
    };
    
    checkTicket();
  }, [finalSessionId, currentUser, roomId, navigate]);
  
  // 🎁 Wallet balance for gifting
  const [tokenBalance, setTokenBalance] = useState(0);
  
  // 🎮 GAME SYSTEM: State
  const [isGameLobbyOpen, setIsGameLobbyOpen] = useState(false);
  const [activeGame, setActiveGame] = useState(null); // Currently active game session
  
  // 🔊 Broadcast permissions (userId -> boolean)
  const [broadcastPermissions, setBroadcastPermissions] = useState({});
  const [remoteAudioStates, setRemoteAudioStates] = useState({});
  
  // 🎭 Theater assignments (userId -> {theater_number, seat_row, seat_col})
  const [userTheaters, setUserTheaters] = useState({});
  const [broadcastRequests, setBroadcastRequests] = useState([]); // Array of user IDs with pending requests
  const [theaters, setTheaters] = useState([]); // List of all theaters for this session
  
  // 🎯 Seat assignment now handled by backend - no client-side calculation
  // Backend will send seat_assigned message with seat key

  const { currentSeat, jumpToSeat, currentSeatKey } = useSeatController({
    currentUser,
    initialSeatId: null, // Backend assigns seat, not client
    cinemaSeats, // ✅ Pass cinemaSeats.json data for camera views
    onSeatChange: (seatKey, seatData) => {
      // ❌ DO NOT send take_seat here - backend already assigned via request_seat
      // Only manual seat swaps should send take_seat (handled in handleSeatSelect)
    }
  });

  const [showDemoAvatars, setShowDemoAvatars] = useState(false); // 🎯 Turned off for production
  // State for video ref
  const videoRef = useRef(null);
  const videoInitializedRef = useRef(false);
  const screenMeshRef = useRef(null);
  const liveShareVideoRef = useRef(null); // ✅ Separate ref for LiveShare main video
  const liveShareCameraVideoRef = useRef(null); // ✅ Separate ref for LiveShare PIP camera
  const podcastCanvasRef = useRef(null); // 🎙️ Canvas for compositing podcast overlays
  const podcastLogoImageRef = useRef(null); // 🎙️ Preloaded logo image
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  // Ref to trigger local emote notification in CinemaScene3D
  const triggerLocalEmoteRef = useRef(null);
  
  // 💬 Ref to trigger chat bubble notifications in CinemaScene3D
  const triggerChatBubbleRef = useRef(null);
  
  // Initialize emote sounds
  const { playEmoteSound } = useEmoteSounds();
  
  // 🔊 User join sound
  const joinSoundRef = useRef(null);
  
  // 🎤 Floating audio notification state
  const [audioNotification, setAudioNotification] = useState(null); // { text: string, timestamp: number }
  
  // 📡 REST API session data (reliable fallback for host detection)
  const [restApiSession, setRestApiSession] = useState(null);

  // 🎮 Game canvas ref for texture rendering
  const gameCanvasRendererRef = useRef(null);
  const [gameCanvas, setGameCanvas] = useState(null);
  
  // 🎮 Game state
  const [currentGame, setCurrentGame] = useState(null); // { sessionId, type, players, gameState }
  const [showGameOverlay, setShowGameOverlay] = useState(false);
  
  useEffect(() => {
    joinSoundRef.current = new Audio('/sounds/userjoin.mp3');
    joinSoundRef.current.volume = 0.5; // 50% volume
    return () => {
      if (joinSoundRef.current) {
        joinSoundRef.current.pause();
        joinSoundRef.current = null;
      }
    };
  }, []);
  
  // 📍 Load cinemaSeats.json on mount
  useEffect(() => {
    const loadCinemaSeats = async () => {
      try {
        console.log('🔄 [CinemaSeats] Starting to load cinemaSeats.json...');
        const response = await fetch('/cinema/cinemaSeats.json');
        const data = await response.json();
        setCinemaSeats(data);
        console.log('✅ [CinemaSeats] Loaded cinemaSeats.json:', data.seats.length, 'seats');
      } catch (err) {
        console.error('❌ [CinemaSeats] Failed to load cinemaSeats.json:', err);
      }
    };
    loadCinemaSeats();
  }, []);
  
  // 🎁 Fetch wallet balance on mount
  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const response = await axios.get('/api/wallets/me', {
          withCredentials: true
        });
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
 
  const [currentTime, setCurrentTime] = useState(0);
  // === VIDEO/PLAYBACK STATE ===
  const [currentMedia, setCurrentMedia] = useState(null);
  const [pendingSeekTime, setPendingSeekTime] = useState(null); // 🎯 Pending seek time for sync
  // === MEDIA PLAYLIST STATE ===
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState(null);
  const [remoteCameraTrack, setRemoteCameraTrack] = useState(null);
  const [localScreenTrack, setLocalScreenTrack] = useState(null);
  
  // 📹 LiveShare state (screen + camera)
  const [liveShareMode, setLiveShareMode] = useState(null); // 'screen', 'camera', 'both'
  const [sharingSource, setSharingSource] = useState(null); // 'liveshare' | 'watchfrom' | null
  
  // 🎙️ Podcast config (for overlay display)
  const [podcastConfig, setPodcastConfig] = useState(null); // { title, logoUrl, guestUserId, guestUsername, mode }
  const [cameraVideoReady, setCameraVideoReady] = useState(false); // Track when camera video element is ready for canvas compositor
  
  // ✅ MediaStream objects for LiveShare (for fullscreen rendering)
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [remoteCameraStream, setRemoteCameraStream] = useState(null);
  const screenShareTrackRef = useRef(null);
  const cameraShareTrackRef = useRef(null);
  const [screenShareTrackSid, setScreenShareTrackSid] = useState(null);
  const [cameraShareTrackSid, setCameraShareTrackSid] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const cameraVideoRef = useRef(null); // For camera video element
  const playbackPositionRef = useRef(0);
  // ✅ REMOVED: fullscreenVideoRef - now using shared videoRef for both 3D and fullscreen
  const [showPositionDebug, setShowPositionDebug] = useState(false);
  const [showFullscreenControls, setShowFullscreenControls] = useState(true); // Auto-hide close button
  const fullscreenInactivityTimerRef = useRef(null);
  const fullscreenContainerRef = useRef(null); // 🎬 Stable ref for fullscreen container (prevents re-renders)
  const fullscreenUploadContainerRef = useRef(null); // 📹 Container for moved upload video in fullscreen
  const loadStartTimeRef = useRef(Date.now()); // ⏱️ Track video loading start time for sync compensation
  const [isFullscreenHovering, setIsFullscreenHovering] = useState(false);
  
  // 🚀 PHASE 2: Model preload handled in CinemaScene3D.jsx (module-level import)
  
  // Add this ref to store the update function
  const videoTextureUpdateRef = useRef(null);
  // 1:1 Chat state
  const [selectedUser, setSelectedUser] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  //const [isChatOpen, setIsChatOpen] = useState(false);
  const [privateMessages, setPrivateMessages] = useState({}); // { userId: [messages] }
  const [unreadMessages, setUnreadMessages] = useState({}); // {userId: unreadCount} - ✅ Unread tracking
  
  // 👥 Friend request state
  const [profileModalUser, setProfileModalUser] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState(null); // 'none', 'pending', 'accepted'
  const [isRequester, setIsRequester] = useState(false); // Did current user send the request?
  const [friendshipsMap, setFriendshipsMap] = useState({}); // { userId: { status, is_requester } }

  // 📱 Mobile state
  const isMobile = useMobile();
  const [isPortrait, setIsPortrait] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isTaskbarVisible, setIsTaskbarVisible] = useState(!isMobile); // Hidden by default on mobile
  const taskbarTimeoutRef = useRef(null);
  const cinemaSceneRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 🎬 Remove scrollbars from body when in 3D cinema
  useEffect(() => {
    // Store original overflow style
    const originalOverflow = document.body.style.overflow;
    const originalOverflowX = document.body.style.overflowX;
    const originalOverflowY = document.body.style.overflowY;
    
    // Hide scrollbars
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';
    document.body.style.overflowY = 'hidden';
    
    // Restore on unmount
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overflowX = originalOverflowX;
      document.body.style.overflowY = originalOverflowY;
    };
  }, []);

  // ✅ Now you have reliable isHost!
  //console.log('🎭 isHost (from RoomPage):', isHost);
  
  // 👥 Handle avatar click - open profile modal
  const handleAvatarClick = async (memberData) => {
    if (!memberData || memberData.id === currentUser?.id) return;
    
    setProfileModalUser(memberData);
    setIsProfileModalOpen(true);
    
    // Check local friendships map (already loaded on mount)
    const friendship = friendshipsMap[memberData.id];
    
    if (friendship) {
      setFriendshipStatus(friendship.status);
      setIsRequester(friendship.is_requester || false);
    } else {
      setFriendshipStatus('none');
      setIsRequester(false);
    }
  };
  
  // 👥 Handle friend request send/cancel
  const handleFriendRequest = async () => {
    if (!profileModalUser) return;
    
    try {
      if (friendshipStatus === 'pending' && isRequester) {
        // Cancel pending request - for now just show message
        toast('Cancel request feature coming soon', { icon: 'ℹ️' });
        return;
      } else {
        // Send new friend request
        await sendFriendRequest(profileModalUser.id);
        setFriendshipStatus('pending');
        setIsRequester(true);
        
        // Update local friendships map
        setFriendshipsMap(prev => ({
          ...prev,
          [profileModalUser.id]: {
            status: 'pending',
            is_requester: true
          }
        }));
        
        toast.success(`Friend request sent to ${profileModalUser.username}`);
      }
    } catch (err) {
      console.error('Friend request error:', err);
      if (err.response?.status === 409) {
        toast.error(err.response.data.error || 'Request already exists');
      } else {
        toast.error('Failed to send friend request');
      }
    }
  };
  
  const handleError = useCallback((err) => {
    if (!currentMedia) return;
    // Ignore benign errors
    const errorMessage = err?.message || err?.toString() || '';
    const isBenignError = 
      errorMessage.includes('interrupted by a call to pause') ||
      errorMessage.includes('aborted by the user agent') ||
      !currentMedia?.mediaUrl;
    if (isBenignError) {
      console.warn("⚠️ Benign video error (ignoring):", errorMessage);
      return;
    }
    console.error("🎬 CinemaVideoPlayer error:", err);
    alert("❌ Failed to play video.");
  }, [currentMedia]);

  if (!authLoading && wsToken && !stableTokenRef.current) {
    stableTokenRef.current = wsToken;
  }

  const { sendMessage, messages, isConnected, sessionStatus } = useWebSocket(
    roomId,
    stableTokenRef.current,
    finalSessionId
  );

  // Log only member-related messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const memberTypes = ['participant_join', 'participant_leave', 'session_member_joined', 'session_status'];
      if (memberTypes.includes(lastMsg.type)) {
        const username = lastMsg.data?.username || `user ${lastMsg.data?.user_id || lastMsg.data?.userId || '?'}`;
        const memberCount = lastMsg.data?.members?.length || '?';
        console.log(`📨 [${lastMsg.type}] ${username}, members: ${memberCount}`);
      }
    }
  }, [messages.length]);
  
  // 🐛 DEBUG: Log ALL WebSocket messages with detailed information
  // ⚠️ PERFORMANCE: Commented out to reduce logging overhead (runs on EVERY message)
  // Uncomment for debugging specific issues
  // useEffect(() => {
  //   if (messages.length === 0) return;
  //   
  //   const lastMsg = messages[messages.length - 1];
  //   
  //   // Log ALL messages with full details
  //   console.log('📨 [WEBSOCKET MESSAGE] Received:', {
  //     type: lastMsg.type,
  //     data: lastMsg.data,
  //     fullMessage: lastMsg,
  //     timestamp: new Date().toISOString(),
  //     messageNumber: messages.length
  //   });
  //   
  //   // Highlight media-related messages
  //   const mediaTypes = [
  //     'media_added',
  //     'media_removed',
  //     'media_list',
  //     'media_selected',
  //     'play_media',
  //     'pause_media',
  //     'seek_media',
  //     'playback_control',
  //     'media_ended',
  //     'request_playback_state',
  //     'playback_state_sync'
  //   ];
  //   
  //   if (mediaTypes.includes(lastMsg.type)) {
  //     console.log('🎬 [MEDIA MESSAGE] ===>', {
  //       type: lastMsg.type,
  //       mediaId: lastMsg.data?.media_id || lastMsg.data?.media_item_id,
  //       fileName: lastMsg.data?.original_name || lastMsg.data?.file_path,
  //       command: lastMsg.data?.command,
  //       seekTime: lastMsg.data?.seek_time,
  //       isPlaying: lastMsg.data?.is_playing,
  //       fullData: lastMsg.data
  //     });
  //   }
  // }, [messages.length]);

  // � CACHE OPTIMIZATION: Load user data from localStorage on mount
  useEffect(() => {
    // Try loading cached user data if not already loaded via props
    if (!passedCurrentUser && !hookCurrentUser) {
      const cachedUser = getCachedUser();
      if (cachedUser) {
        console.log('⚡ [Cache] Using cached user data for instant UI:', cachedUser.username);
        // Note: We don't setState here since hookCurrentUser will load fresh data
        // The cached data is just for logging/debugging - the useAuth hook handles state
      }
    }
    
    // Try loading cached cinema seats
    const cachedSeats = getCachedCinemaSeats();
    if (cachedSeats) {
      console.log(`⚡ [Cache] Loaded ${cachedSeats.length} cinema seats from cache`);
      setCinemaSeats({ seats: cachedSeats });
    }
  }, []); // Run once on mount

  // 🔄 Cache fresh user data when it loads
  useEffect(() => {
    if (currentUser && currentUser.id) {
      cacheUserData(currentUser);
    }
  }, [currentUser]);

  // 🔄 Cache cinema seats when they're generated/loaded
  useEffect(() => {
    if (cinemaSeats.seats && cinemaSeats.seats.length > 0) {
      cacheCinemaSeats(cinemaSeats.seats);
    }
  }, [cinemaSeats.seats.length]); // Only cache when seat count changes

  // �🔄 Auto-request seat assignment when connecting to cinema
  useEffect(() => {
    // ✅ Don't request seat if already assigned (prevents duplicate requests on re-render)
    if (hasSeatAssigned) {
      console.log('⏭️ [SEAT REQUEST] Already seated - skipping request');
      return;
    }
    
    if (isConnected && sendMessage && finalSessionId && currentUser) {
      console.log('🔍 [SEAT REQUEST DEBUG] Conditions met:', {
        isConnected,
        hasSendMessage: !!sendMessage,
        finalSessionId,
        currentUserId: currentUser?.id,
        currentUsername: currentUser?.username,
        cinemaSeatsLoaded: cinemaSeats.seats.length,
        timestamp: new Date().toISOString()
      });
      
      console.log(`🪑 [SEAT REQUEST] ${currentUser.username} (ID:${currentUser.id}) requesting seat assignment...`);
      
      // Update loading status - only on initial request (not on seat swaps/changes)
      if (enableLoadingOverlay && isInitialSeatRequest) {
        setLoadingStatus('finding_seat');
        console.log('⏳ [Spinner] Showing for initial seat request');
      } else if (!isInitialSeatRequest) {
        console.log('⚡ [Spinner] Skipping for seat change/swap (user already connected)');
      }
      
      // ✅ Small delay to ensure component is fully mounted and stable before requesting seat
      // This prevents race condition where backend response arrives during component remount
      setTimeout(() => {
        console.log(`🪑 [SEAT REQUEST] Sending request after stability delay...`);
        sendMessage({ type: 'request_seat' });
        sendMessage({ type: 'request_seat_state' });
      }, 100); // 100ms delay
    } else {
      console.log('⏸️ [SEAT REQUEST DEBUG] Waiting for conditions:', {
        isConnected,
        hasSendMessage: !!sendMessage,
        hasFinalSessionId: !!finalSessionId,
        hasCurrentUser: !!currentUser,
        cinemaSeatsLoaded: cinemaSeats.seats.length
      });
    }
  }, [isConnected, sendMessage, finalSessionId, currentUser, enableLoadingOverlay, hasSeatAssigned]);
  // Load all friendships once on mount
  useEffect(() => {
    const loadFriendships = async () => {

      if (!currentUser?.id) return;
      
      try {
        // Fetch all friendship types
        const [friendsRes, pendingRes, sentRes] = await Promise.all([
          getFriendsList(),
          getPendingFriendRequests(),
          getSentFriendRequests()
        ]);
        
        const friends = friendsRes.data.friends || [];
        const pendingRequests = pendingRes.data.requests || [];
        const sentRequests = sentRes.data.requests || [];
        
        // Build map of userId -> friendship data
        const map = {};
        
        // Accepted friends - normalize ID field (could be id, ID, or user_id)
        friends.forEach(friend => {
          const friendId = friend.id || friend.ID || friend.user_id;
          if (friendId) {
            map[friendId] = {
              status: 'accepted',
              is_requester: false
            };
          }
        });
        
        // Pending requests received (they sent to us)
        pendingRequests.forEach(request => {
          const requesterId = request.requester?.id || request.requester?.ID || request.requester_id;
          if (requesterId) {
            map[requesterId] = {
              status: 'pending',
              is_requester: false // We are the recipient
            };
          }
        });
        
        // Sent requests (we sent to them)
        sentRequests.forEach(request => {
          const recipientId = request.recipient?.id || request.recipient?.ID || request.recipient_id;
          if (recipientId) {
            map[recipientId] = {
              status: 'pending',
              is_requester: true // We are the requester
            };
          }
        });
        
        setFriendshipsMap(map);
        console.log(`👥 [Friendships] Loaded ${friends.length} friends, ${pendingRequests.length} pending, ${sentRequests.length} sent`);
      } catch (err) {
        console.error('Failed to load friendships:', err);
        setFriendshipsMap({});
      }
    };
    
    loadFriendships();
  }, [currentUser?.id]);

  // 👥 Listen for real-time friendship updates
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    
    const lastMsg = messages[messages.length - 1];
    
    // Friend request accepted
    if (lastMsg.type === 'friend_request_accepted') {
      const fromUserId = lastMsg.from_user_id;
      console.log(`👥 [Friendship] Request accepted by user ${fromUserId}`);
      
      // Update friendships map
      setFriendshipsMap(prev => ({
        ...prev,
        [fromUserId]: {
          status: 'accepted',
          is_requester: false
        }
      }));
      
      // Update modal if it's open for this user
      if (profileModalUser?.id === fromUserId) {
        setFriendshipStatus('accepted');
        setIsRequester(false);
      }
      
      toast.success(`${lastMsg.from_username} accepted your friend request! 🎉`);
    }
    
    // Friend request received
    if (lastMsg.type === 'friend_request_received') {
      const fromUserId = lastMsg.from_user_id;
      console.log(`👥 [Friendship] Request received from user ${fromUserId}`);
      
      // Update friendships map
      setFriendshipsMap(prev => ({
        ...prev,
        [fromUserId]: {
          status: 'pending',
          is_requester: false // They sent to us
        }
      }));
      
      // Update modal if it's open for this user
      if (profileModalUser?.id === fromUserId) {
        setFriendshipStatus('pending');
        setIsRequester(false);
      }
      
      toast(`${lastMsg.from_username} sent you a friend request`, { icon: '👋' });
    }
  }, [messages, profileModalUser]);

  // ✅ RELIABLE HOST DETECTION: Use sessionStatus.host_id (sent by backend)
  // Must be AFTER useWebSocket since we need sessionStatus
  const isHostFromSession = currentUser?.id === sessionStatus?.hostId;
  const isHostFromMembers = currentUser?.id === roomMembers.find(m => m.user_role === 'host')?.id;
  const isHost = isHostFromState || isHostFromSession || isHostFromMembers; // Use || not ?? (false is falsy but not null)

  // 📡 Fetch active session from REST API on mount (reliable source for host_id)
  useEffect(() => {
    const fetchActiveSession = async () => {
      if (!roomId) return;
      try {
        const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
        // console.log('📡 [CinemaScene3D] Fetched REST API session:', response.data);
        if (response.data && response.data.session_id) {
          setRestApiSession(response.data);
        }
      } catch (error) {
        console.error('❌ [CinemaScene3D] Failed to fetch active session:', error);
      }
    };
    fetchActiveSession();
  }, [roomId]);
  
  // 💾 Save playback state to localStorage (per-media, for resume functionality)
  useEffect(() => {
    if (!isHost || !roomId || !finalSessionId || !currentMedia || currentMedia.type !== 'upload') return;
    
    // Only save if media is playing and has valid ID
    if (isPlaying && currentMedia.ID && videoRef.current) {
      const storageKey = `cinema_playback_${roomId}_${finalSessionId}_${currentMedia.original_name}_${currentMedia.ID}`;
      
      const playbackState = {
        mediaId: currentMedia.ID,
        title: currentMedia.original_name,
        file_path: currentMedia.file_path,
        mediaUrl: currentMedia.mediaUrl,
        seekTime: videoRef.current.currentTime,
        timestamp: Date.now(),
      };
      
      // Throttle to every 5 seconds to avoid excessive writes
      if (Math.floor(currentTime) % 5 === 0 && Math.abs(currentTime - Math.floor(currentTime)) < 0.1) {
        localStorage.setItem(storageKey, JSON.stringify(playbackState));
        console.log('💾 [Resume] Saved seek time for', currentMedia.original_name, ':', Math.floor(videoRef.current.currentTime), 's');
      }
    }
  }, [isHost, currentMedia, currentTime, isPlaying, roomId, finalSessionId]);

  // MEMBER: Request current playback state on connect (upload media only)
  useEffect(() => {
    if (!isConnected || !currentUser?.id || isHost) return;

    // Wait a moment for host to be established
    const timer = setTimeout(() => {
      console.log('[3D Cinema] MEMBER requesting playback state from host');
      sendMessage({
        type: 'request_playback_state',
        requester_id: currentUser.id,
        timestamp: Date.now()
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [isConnected, currentUser?.id, isHost, sendMessage]);

  // Clear all saved playback states for this session on unmount
  useEffect(() => {
    return () => {
      if (!roomId || !finalSessionId) return;

      const prefix = `cinema_playback_${roomId}_${finalSessionId}_`;
      const keysToRemove = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('[Resume State] Cleared all session states on unmount:', keysToRemove.length);
    };
  }, [roomId, finalSessionId]);

  // 🔄 Restore media playback state on mount (REMOVED - now using Resume button instead)
  // Resume functionality will be handled via explicit user action in LeftSidebar

  // 🐛 DEBUG: Track currentMedia state changes
  useEffect(() => {
    console.log('🎬 [CURRENT MEDIA STATE] Changed:', {
      hasMedia: !!currentMedia,
      mediaId: currentMedia?.ID || currentMedia?.id,
      type: currentMedia?.type,
      title: currentMedia?.original_name || currentMedia?.title,
      mediaUrl: currentMedia?.mediaUrl || currentMedia?.file_url,
      fullMedia: currentMedia,
      timestamp: new Date().toISOString()
    });
  }, [currentMedia]);
  
  // 🎬 Load uploaded media into video element when currentMedia changes
  useEffect(() => {
    // Don't interfere with LiveShare video elements
    if (liveShareMode) {
      console.log('⏭️ [Media Loading] Skipping - LiveShare is active');
      return;
    }

    // Clear video if no media
    if (!currentMedia) {
      console.log('🧹 [Media Loading] No currentMedia - clearing video element');
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.load();
      }
      return;
    }

    // Only handle uploaded media (not screen_share which uses LiveKit streams)
    if (currentMedia.type !== 'upload') {
      console.log('⏭️ [Media Loading] Skipping non-upload media type:', currentMedia.type);
      return;
    }

    const mediaUrl = currentMedia.mediaUrl || currentMedia.file_url;
    if (!mediaUrl) {
      console.warn('⚠️ [Media Loading] No media URL found:', currentMedia);
      return;
    }

    console.log('🎬 [Media Loading] Loading uploaded media:', mediaUrl);

    // ✅ SHARED VIDEO: Create or reuse video element with fullscreen-ready styling
    if (!videoRef.current) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.loop = false;
      video.muted = false;
      video.playsInline = true;
      video.preload = 'auto';
      video.autoplay = true;
      // Same fullscreen-ready CSS as in the other init
      video.style.cssText = 'position: fixed; width: 100vw; height: 100vh; top: 0; left: 0; object-fit: contain; background: black; opacity: 0; z-index: -1; pointer-events: none;';
      video.id = 'shared-cinema-video';
      document.body.appendChild(video);
      videoRef.current = video;
      videoInitializedRef.current = true;
    }

    const video = videoRef.current;
    
    // 🎯 FIX: Only reload src if it's actually different (prevents mid-stream reloads)
    const needsReload = video.src !== mediaUrl;
    if (needsReload) {
      console.log('🔄 [Media Loading] Setting new video src:', mediaUrl);
      video.src = mediaUrl;
    } else {
      console.log('✅ [Media Loading] Video already loaded, skipping src reload');
    }

    const handleLoadedData = () => {
      console.log('✅ [Media Loading] Video data loaded, attempting play...', {
        readyState: video.readyState,
        currentTime: video.currentTime,
        isPlaying,
        hasPendingSeek: pendingSeekTime !== null
      });
      
      // 🎯 Apply pending seek time if available (for mid-playback sync)
      if (pendingSeekTime !== null && pendingSeekTime > 0) {
        // 🚀 Triple compensation: network latency + loading time
        const loadingDuration = (Date.now() - loadStartTimeRef.current) / 1000;
        const compensatedTime = pendingSeekTime + loadingDuration;
        
        console.log(`🎯 [Sync] Latency compensation applied:`, {
          originalSeekTime: pendingSeekTime.toFixed(2),
          loadingDuration: loadingDuration.toFixed(2),
          compensatedTime: compensatedTime.toFixed(2)
        });
        
        video.currentTime = compensatedTime;
        setPendingSeekTime(null); // Clear after applying
      }
      
      if (isPlaying) {
        console.log('▶️ [Media Loading] Starting playback...');
        video.play().catch(err => console.error('❌ [Media Loading] Failed to play:', err));
      } else {
        console.log('⏸️ [Media Loading] Video loaded but isPlaying=false, not starting playback');
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = () => {
      console.log('🏁 [Media Loading] Video ended');
      setIsPlaying(false);
      
      // Clear saved playback state when video ends naturally
      if (currentMedia?.type === 'upload') {
        const mediaId = currentMedia.ID || currentMedia.id;
        const originalName = currentMedia.metadata?.originalName || currentMedia.originalName || currentMedia.title;
        const storageKey = `cinema_playback_${roomId}_${finalSessionId}_${originalName}_${mediaId}`;
        localStorage.removeItem(storageKey);
        console.log('🧹 [Resume State] Cleared on video end:', storageKey);
      }
      
      if (isHost) {
        sendMessage({
          type: 'media_ended',
          data: {
            media_id: currentMedia.ID || currentMedia.id,
            final_timestamp: video.duration
          }
        });
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [currentMedia, liveShareMode, isPlaying, isHost, sendMessage, pendingSeekTime]);

  // 🎬 Sync play/pause state to video element
  useEffect(() => {
    if (!videoRef.current || liveShareMode || currentMedia?.type !== 'upload') {
      return;
    }

    const video = videoRef.current;
    
    console.log('🔄 [Media Sync] Checking play/pause state:', {
      isPlaying,
      videoPaused: video.paused,
      currentTime: video.currentTime.toFixed(2),
      needsPlay: isPlaying && video.paused,
      needsPause: !isPlaying && !video.paused
    });
    
    if (isPlaying && video.paused) {
      console.log('▶️ [Media Sync] Playing video');
      video.play().catch(err => console.error('❌ [Media Sync] Play failed:', err));
    } else if (!isPlaying && !video.paused) {
      console.log('⏸️ [Media Sync] Pausing video');
      video.pause();
    }
  }, [isPlaying, liveShareMode, currentMedia]);

  // ⏱️ Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // ⏰ Adaptive seek time sync - 8s normal, 4s when drift detected (optimized for smooth playback)
  useEffect(() => {
    if (!isHost || !currentMedia || currentMedia.type !== 'upload' || !isPlaying) {
      return;
    }

    const NORMAL_SYNC_INTERVAL = 8000;  // 8 seconds (reduced sync frequency for smoother playback)
    const FAST_SYNC_INTERVAL = 4000;    // 4 seconds when drift detected (still responsive but not aggressive)
    const DRIFT_THRESHOLD = 3;          // 3 seconds tolerance before increasing frequency
    let currentInterval = NORMAL_SYNC_INTERVAL;
    let lastKnownTime = 0;
    let lastSyncTimestamp = Date.now();

    const syncPlayback = () => {
      if (videoRef.current && currentMedia) {
        const currentSeekTime = Math.floor(videoRef.current.currentTime);
        
        // Adaptive logic: detect drift
        const now = Date.now();
        const timeSinceLastSync = (now - lastSyncTimestamp) / 1000;
        const expectedTime = lastKnownTime + timeSinceLastSync;
        const drift = Math.abs(currentSeekTime - expectedTime);
        
        // Adjust interval based on drift
        if (drift > DRIFT_THRESHOLD) {
          currentInterval = FAST_SYNC_INTERVAL;
          // console.log(`⚡ [Sync] High drift (${drift.toFixed(1)}s) - increasing frequency`);
        } else {
          currentInterval = NORMAL_SYNC_INTERVAL;
        }
        
        // console.log(`⏰ [Sync] ${currentSeekTime}s (drift: ${drift.toFixed(1)}s, interval: ${currentInterval}ms)`);
        
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
        
        lastKnownTime = currentSeekTime;
        lastSyncTimestamp = now;
      }
    };

    // Initial sync
    syncPlayback();
    
    // Dynamic interval that adapts
    let intervalId = setInterval(() => {
      syncPlayback();
      // Restart interval with new timing if changed
      clearInterval(intervalId);
      intervalId = setInterval(syncPlayback, currentInterval);
    }, currentInterval);

    return () => clearInterval(intervalId);
  }, [isHost, currentMedia, isPlaying, sendMessage, currentUser?.id]);

  // 📱 Mobile orientation detection and force landscape (phones only, not tablets)
  useEffect(() => {
    if (!isMobile) return;

    const checkOrientation = () => {
      // Only show orientation prompt for phones (width < 768px), not tablets
      const isPhone = window.innerWidth < 768;
      const isPortraitMode = window.innerHeight > window.innerWidth;
      setIsPortrait(isPhone && isPortraitMode);
    };

    // Initial check
    checkOrientation();

    // Try to lock to landscape (may fail without user gesture)
    const lockOrientation = async () => {
      // Only attempt lock for phones, not tablets
      if (window.innerWidth >= 768) return;
      
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
          console.log('✅ [Mobile] Locked to landscape orientation');
        }
      } catch (error) {
        console.warn('⚠️ [Mobile] Could not lock orientation:', error.message);
        // Show tutorial instead as fallback
        setShowTutorial(true);
      }
    };

    // Delay lock attempt to ensure user gesture context
    const timer = setTimeout(lockOrientation, 500);

    // Listen for orientation changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      
      // Unlock orientation on unmount
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    };
  }, [isMobile]);

  // 📱 Mobile taskbar auto-hide logic
  const showTaskbar = useCallback(() => {
    setIsTaskbarVisible(true);
    
    // Clear existing timeout
    if (taskbarTimeoutRef.current) {
      clearTimeout(taskbarTimeoutRef.current);
    }
    
    // Auto-hide after 4 seconds on mobile
    if (isMobile) {
      taskbarTimeoutRef.current = setTimeout(() => {
        setIsTaskbarVisible(false);
      }, 4000);
    }
  }, [isMobile]);

  const hideTaskbar = useCallback(() => {
    if (isMobile) {
      setIsTaskbarVisible(false);
      if (taskbarTimeoutRef.current) {
        clearTimeout(taskbarTimeoutRef.current);
      }
    }
  }, [isMobile]);

  // 📱 Swipe-up gesture to reveal taskbar on mobile (landscape mode)
  useEffect(() => {
    if (!isMobile) return;

    let touchStartY = 0;
    let touchEndY = 0;

    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      touchEndY = e.changedTouches[0].clientY;
      const swipeDistance = touchStartY - touchEndY;
      const screenHeight = window.innerHeight;

      // Swipe up from bottom 20% of screen with at least 50px swipe distance
      if (touchStartY > screenHeight * 0.8 && swipeDistance > 50) {
        showTaskbar();
      }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, showTaskbar]);
  
  // Handle session errors - redirect if session has ended
  useEffect(() => {
    if (sessionStatus?.error) {
      console.error('❌ Session error detected:', sessionStatus.error);
      
      // Show error toast
      toast.error(sessionStatus.error, {
        duration: 5000,
        icon: '⚠️'
      });
      
      // If session is explicitly inactive (ended), redirect after delay
      if (!sessionStatus?.isActive) {
        console.log('🔙 [Session] Session ended, redirecting to room page...');
        setTimeout(() => {
          navigate(`/rooms/${roomId}`, { replace: true });
        }, 3000); // Give user time to read the error message
      }
    }
  }, [sessionStatus?.error, sessionStatus?.isActive, roomId, navigate]);

  // ✅ Request room state on join (for new users and refreshes)
  useEffect(() => {
    if (isConnected && currentUser?.id && sendMessage) {
      console.log('🔄 [Lights] Requesting room state on join');
      sendMessage({
        type: 'request_room_state',
        data: { user_id: currentUser.id }
      });
    }
  }, [isConnected, currentUser?.id, sendMessage]);

  // ✅ Cleanup sessionStorage on component unmount
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(`cinema_lights_${roomId}`);
      } catch (err) {
        console.warn('Failed to cleanup lights state:', err);
      }
    };
  }, [roomId]);

  // Error management
  const playIgnoringBenign = (videoEl, context = '') => {
    if (!videoEl) return;
    const playPromise = videoEl.play();
    if (playPromise?.catch) {
      playPromise.catch(err => {
        if (
          err.name !== 'AbortError' &&
          !err.message.includes('interrupted') &&
          !err.message.includes('not allowed')
        ) {
          console.error(`🎬 [${context}] Play failed:`, err);
        }
      });
    }
  };

  // Shared emote handler for both keyboard and Taskbar clicks
  // 🎤 Show floating audio notification
  const showAudioNotification = useCallback((message) => {
    setAudioNotification({
      text: message,
      timestamp: Date.now()
    });
    
    // Auto-hide after 1.5 seconds
    setTimeout(() => {
      setAudioNotification(null);
    }, 1500);
  }, []);

  // Expose showAudioNotification to window for use in other effects
  useEffect(() => {
    window.showAudioNotificationFn = showAudioNotification;
    return () => {
      delete window.showAudioNotificationFn;
    };
  }, [showAudioNotification]);

  const handleEmoteSend = useCallback((emoteData) => {
    // console.log('🎭 [CinemaScene3DDemo] handleEmoteSend called:', emoteData);
    
    // Trigger local notification in CinemaScene3D
    if (triggerLocalEmoteRef.current) {
      // console.log('✨ [CinemaScene3DDemo] Triggering local emote notification');
      triggerLocalEmoteRef.current(emoteData.emote);
    }
    
    // Send to WebSocket
    if (sendMessage && sessionStatus?.id) {
      sendMessage({
        type: 'emote',
        data: {
          ...emoteData,
          session_id: sessionStatus.id,
          user_id: currentUser?.id,
          username: currentUser?.username
        }
      });
    }
  }, [sendMessage, sessionStatus, currentUser]);

  // Add to your handlers section
  const handleToggleLights = () => {
    const newLightsState = !lightsOn;
    setLightsOn(newLightsState);
    
    // ✅ Persist to sessionStorage for refresh survival
    try {
      sessionStorage.setItem(`cinema_lights_${roomId}`, JSON.stringify(newLightsState));
    } catch (err) {
      console.warn('Failed to save lights state:', err);
    }
    
    // ✅ Broadcast to all connected users
    if (sendMessage) {
      sendMessage({
        type: 'update_lights',
        data: { lightsOn: newLightsState }
      });
    }
  };

  // ✅ Darkness level change handler
  const handleDarknessLevelChange = (newLevel) => {
    setDarknessLevel(newLevel);
    
    // ✅ Persist to sessionStorage for refresh survival
    try {
      sessionStorage.setItem(`cinema_darkness_level_${roomId}`, JSON.stringify(newLevel));
    } catch (err) {
      console.warn('Failed to save darkness level:', err);
    }
    
    // ✅ Broadcast to all connected users
    if (sendMessage) {
      sendMessage({
        type: 'darkness_level_changed',
        data: { darknessLevel: newLevel }
      });
    }
  };

  // 🎯 Position Calculator handlers
  const handleSavePosition = useCallback(() => {
    const updatedSeats = { ...cinemaSeats };
    const seatIndex = updatedSeats.seats.findIndex(s => s.id === selectedSeatId);
    if (seatIndex !== -1) {
      updatedSeats.seats[seatIndex].position = [...currentCameraPos];
      setCinemaSeats(updatedSeats);
      console.log(`✅ Saved position for Seat ${selectedSeatId}:`, currentCameraPos);
      toast.success(`Seat ${selectedSeatId} position saved!`);
    }
  }, [cinemaSeats, selectedSeatId, currentCameraPos]);

  // 📷 Handle camera view cycling
  const handleCycleView = useCallback((direction) => {
    if (!currentSeat || !cinemaSeats.seats.length) return;
    
    const seatData = cinemaSeats.seats.find(s => s.id === currentSeat.id);
    if (!seatData?.cameraViews) return;
    
    let newView = currentCameraView;
    
    if (direction === 'left') {
      // Cycle left: center → left (can't go further left from left)
      if (currentCameraView === 'center') newView = 'left';
      // From right → center
      else if (currentCameraView === 'right') newView = 'center';
    } else if (direction === 'right') {
      // Cycle right: center → right (can't go further right from right)
      if (currentCameraView === 'center') newView = 'right';
      // From left → center
      else if (currentCameraView === 'left') newView = 'center';
    }
    
    const viewData = seatData.cameraViews[newView];
    if (!viewData) return;
    
    console.log(`📷 [CycleView] Switching from ${currentCameraView} to ${newView}`);
    
    // Update camera via ref if available
    if (cinemaSceneRef.current?.setCameraView) {
      cinemaSceneRef.current.setCameraView(viewData.position, viewData.lookAt);
    }
    
    setCurrentCameraView(newView);
    
    // Show arrows and reset hide timer
    setShowCameraArrows(true);
    if (cameraArrowTimeoutRef.current) {
      clearTimeout(cameraArrowTimeoutRef.current);
    }
    cameraArrowTimeoutRef.current = setTimeout(() => {
      setShowCameraArrows(false);
    }, 5000);
  }, [currentCameraView, currentSeat, cinemaSeats]);

  // Reset camera view to center when seat changes
  useEffect(() => {
    if (currentSeat) {
      setCurrentCameraView('center');
      setShowCameraArrows(true);
      
      // Auto-hide arrows after 5 seconds
      if (cameraArrowTimeoutRef.current) {
        clearTimeout(cameraArrowTimeoutRef.current);
      }
      cameraArrowTimeoutRef.current = setTimeout(() => {
        setShowCameraArrows(false);
      }, 5000);
    }
    
    // Cleanup on unmount
    return () => {
      if (cameraArrowTimeoutRef.current) {
        clearTimeout(cameraArrowTimeoutRef.current);
      }
    };
  }, [currentSeat?.id]);

  const handleSaveCameraView = useCallback((viewType) => {
    console.log(`🎯 [handleSaveCameraView] Saving ${viewType} view:`);
    console.log('  Current position:', currentCameraPos);
    console.log('  Current lookAt:', currentCameraLookAt);
    console.log('  cinemaSeats state:', cinemaSeats);
    console.log('  cinemaSeats.seats length:', cinemaSeats.seats?.length);
    console.log('  selectedSeatId:', selectedSeatId);
    
    if (!cinemaSeats.seats || cinemaSeats.seats.length === 0) {
      console.error('❌ cinemaSeats.seats is empty! Cannot save.');
      toast.error('Error: Seat data not loaded. Please refresh the page.');
      return;
    }
    
    const updatedSeats = { ...cinemaSeats };
    const seatIndex = updatedSeats.seats.findIndex(s => s.id === selectedSeatId);
    console.log('  Found seatIndex:', seatIndex);
    
    if (seatIndex !== -1) {
      updatedSeats.seats[seatIndex].cameraViews[viewType] = {
        position: [...currentCameraPos],
        lookAt: [...currentCameraLookAt]
      };
      setCinemaSeats(updatedSeats);
      console.log(`✅ Saved ${viewType} view for Seat ${selectedSeatId}:`, updatedSeats.seats[seatIndex].cameraViews[viewType]);
      toast.success(`Seat ${selectedSeatId} ${viewType} view saved!`);
    } else {
      console.error(`❌ Seat ${selectedSeatId} not found in seats array`);
      toast.error(`Seat ${selectedSeatId} not found!`);
    }
  }, [cinemaSeats, selectedSeatId, currentCameraPos, currentCameraLookAt]);

  const handleDeleteSeat = useCallback(() => {
    const updatedSeats = { ...cinemaSeats };
    const seatIndex = updatedSeats.seats.findIndex(s => s.id === selectedSeatId);
    if (seatIndex !== -1) {
      // Reset seat to zeros
      updatedSeats.seats[seatIndex].position = [0, 0, 0];
      updatedSeats.seats[seatIndex].cameraViews = {
        left: { position: [0, 0, 0], lookAt: [0, 0, 0] },
        center: { position: [0, 0, 0], lookAt: [0, 0, 0] },
        right: { position: [0, 0, 0], lookAt: [0, 0, 0] }
      };
      setCinemaSeats(updatedSeats);
      console.log(`🗑️ Deleted Seat ${selectedSeatId}`);
      toast.success(`Seat ${selectedSeatId} deleted!`);
    }
  }, [cinemaSeats, selectedSeatId]);

  const handleClearAll = useCallback(() => {
    if (!confirm('Clear all seat data? This cannot be undone!')) return;
    const updatedSeats = { ...cinemaSeats };
    updatedSeats.seats.forEach(seat => {
      seat.position = [0, 0, 0];
      seat.cameraViews = {
        left: { position: [0, 0, 0], lookAt: [0, 0, 0] },
        center: { position: [0, 0, 0], lookAt: [0, 0, 0] },
        right: { position: [0, 0, 0], lookAt: [0, 0, 0] }
      };
    });
    setCinemaSeats(updatedSeats);
    console.log('🗑️ Cleared all seats');
    toast.success('All seats cleared!');
  }, [cinemaSeats]);

  const handleExportJSON = useCallback(() => {
    const dataStr = JSON.stringify(cinemaSeats, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cinemaSeats.json';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('cinemaSeats.json exported!');
  }, [cinemaSeats]);

  // 🎤 Audio mode toggle handler (host only)
  const handleAudioModeToggle = useCallback((newMode) => {
    if (!isHost) {
      console.warn('[Cinema] Only host can change audio mode');
      return;
    }

    console.log(`🎤 [Cinema] Host changing audio mode: ${audioMode} → ${newMode}`);
    setAudioMode(newMode);
    
    // Persist to sessionStorage
    sessionStorage.setItem(`cinema_audio_mode_${roomId}`, newMode);

    // Broadcast mode change to all users
    if (sendMessage && finalSessionId) {
      sendMessage({
        type: 'audio_mode_changed',
        mode: newMode,
        host_id: currentUser?.id,
        session_id: finalSessionId
      });
    }
  }, [isHost, audioMode, roomId, sendMessage, finalSessionId, currentUser]);

  // 🎤 Cinema audio hook (row-based audio management)
  const {
    hasMicPermission,
    isAudioActive: cinemaAudioActive,
    localStream: cinemaLocalStream,
    audioDevices: cinemaAudioDevices,
    selectedAudioDeviceId: cinemaSelectedDeviceId,
    toggleAudio: cinemaToggleAudio,
    changeAudioDevice: cinemaChangeDevice,
    getRowFromSeat,
  } = useCinemaAudio({
    isHost,
    userSeats,
    authenticatedUserID: currentUser?.id,
    audioMode,
    sendMessage,
    sessionId: finalSessionId,
    isHostBroadcasting, // ✅ Pass host broadcast state
  });

  // 🎵 LiveKit setup - always auto-subscribe, then selectively unsubscribe in seat mode
  const shouldAutoSubscribe = true;
  
  const {
    room,
    localParticipant,
    remoteParticipants,
    isConnected: isLiveKitConnected,
    connect: connectLiveKit,
    disconnect: disconnectLiveKit
  } = useLiveKitRoom(roomId, currentUser, shouldAutoSubscribe);

  // ✅ Connect to LiveKit when room, user, AND session membership are ready
  const hasAttemptedLiveKitConnection = useRef(false);
  
  useEffect(() => {
    if (!roomId || !currentUser?.id) {
      console.log('⏳ [Cinema LiveKit] Waiting for room/user...', { roomId, userId: currentUser?.id });
      return;
    }
    
    // 🎯 CRITICAL: Wait for session membership confirmation to prevent 403 race condition
    if (!isSessionMemberConfirmed) {
      console.log('⏳ [Cinema LiveKit] Waiting for session membership confirmation...');
      console.log('   This prevents 403 errors when LiveKit token is requested before session member is created');
      return;
    }
    
    if (hasAttemptedLiveKitConnection.current) {
      console.log('⏭️ [Cinema LiveKit] Connection already attempted, skipping');
      return;
    }
    
    console.log('🔗 [Cinema LiveKit] Session confirmed! Initiating connection for room:', roomId);
    
    // Set loading status for voice connection
    if (enableLoadingOverlay) {
      setLoadingStatus('connecting_voice');
    }
    
    hasAttemptedLiveKitConnection.current = true;
    connectLiveKit();
    
    return () => {
      // Cleanup: unpublish audio track
      if (publishedAudioTrackRef.current && typeof publishedAudioTrackRef.current.stop === 'function') {
        publishedAudioTrackRef.current.stop();
        publishedAudioTrackRef.current = null;
      }
      disconnectLiveKit();
    };
  }, [roomId, currentUser?.id, isSessionMemberConfirmed, connectLiveKit, disconnectLiveKit, enableLoadingOverlay]);
  
  // 🎯 Move from voice connection to seat finding when LiveKit connects
  useEffect(() => {
    if (isLiveKitConnected && loadingStatus === 'connecting_voice') {
      console.log('✅ [Cinema LiveKit] Voice connected, transitioning to finding_seat');
      setLoadingStatus('finding_seat');
    }
  }, [isLiveKitConnected, loadingStatus]);
  
  // ✅ Clear loading overlay only when user is BOTH a member AND has a seat
  useEffect(() => {
    if (loadingStatus === 'finding_seat' && currentUser?.id) {
      const isMember = roomMembers.some(m => m.user_id === currentUser.id);
      const hasSeat = !!userSeats[currentUser.id];
      
      console.log('🔍 [Loading Check]', {
        isMember,
        hasSeat,
        memberCount: roomMembers.length,
        seatCount: Object.keys(userSeats).length
      });
      
      if (isMember && hasSeat) {
        console.log('✅ [Loading] User is member with seat - clearing overlay');
        setLoadingStatus(null);
        setHasSeatAssigned(true);
      }
    }
  }, [loadingStatus, currentUser?.id, roomMembers, userSeats]);

  // 🎤 Audio level tracking for pulsating speaking icons
  const [activeSpeakers, setActiveSpeakers] = useState(new Map()); // Map<participantIdentity, {isSpeaking: boolean, audioLevel: number}>
  
  useEffect(() => {
    if (!room) return;

    const handleActiveSpeakersChanged = (speakers) => {
      console.log('🎤 [Audio Levels] Active speakers changed:', speakers.length);
      
      const newSpeakersMap = new Map();
      
      speakers.forEach(speaker => {
        const audioLevel = speaker.audioLevel || 0;
        const normalizedLevel = Math.round(audioLevel * 255); // Convert 0-1 to 0-255
        
        newSpeakersMap.set(speaker.identity, {
          isSpeaking: true,
          audioLevel: normalizedLevel
        });
        
        console.log('🎤 [Audio Level]', speaker.identity, ':', normalizedLevel, '/ 255');
      });
      
      setActiveSpeakers(newSpeakersMap);
    };

    room.on('activeSpeakersChanged', handleActiveSpeakersChanged);

    return () => {
      room.off('activeSpeakersChanged', handleActiveSpeakersChanged);
    };
  }, [room]);

  // 🎯 Dynamic subscription management - runs on mode change or seat updates
  useEffect(() => {
    if (!room) {
      console.log('🎯 [Dynamic Subscription] Skipped - no room');
      return;
    }

    console.log('🎯 [Dynamic Subscription] Evaluating subscriptions - Mode:', audioMode);

    /**
     * Determine if current user should subscribe to a speaker's audio
     */
    const shouldSubscribeToSpeaker = (speakerUserId) => {
      // Party mode: subscribe to everyone
      if (audioMode === 'party') {
        return true;
      }

      // Seat mode: check row proximity
      const myUserId = currentUser?.id;
      const mySeat = userSeats[myUserId];
      const speakerSeat = userSeats[speakerUserId];

      if (!mySeat || !speakerSeat) {
        console.log(`🎯 [Sub Check] Missing seats - me: ${mySeat}, speaker: ${speakerSeat}`);
        return false;
      }

      const myRow = getRowFromSeat(mySeat);
      const speakerRow = getRowFromSeat(speakerSeat);

      // Check if speaker is host and broadcasting
      const speakerUserIdNum = parseInt(speakerUserId);
      const member = roomMembers.find(m => m.id === speakerUserIdNum);
      const speakerIsHost = member && room.metadata?.host_id === member.id;
      
      if (speakerIsHost && isHostBroadcasting) {
        console.log(`🎯 [Sub Check] Host (${speakerUserId}) is broadcasting - SUBSCRIBE`);
        return true;
      }

      const shouldSubscribe = myRow === speakerRow;
      
      console.log(`🎯 [Sub Check] ${speakerUserId}:`, {
        mode: audioMode,
        mySeat,
        myRow,
        speakerSeat,
        speakerRow,
        shouldSubscribe
      });

      return shouldSubscribe;
    };

    /**
     * Process a track publication and set subscription state
     */
    const processTrackPublication = (publication, participant) => {
      // ✅ ALWAYS subscribe to video tracks (screen share, camera)
      if (publication.kind === 'video') {
        if (!publication.isSubscribed) {
          console.log(`📹 [Dynamic Sub] Video track - SUBSCRIBING: ${participant.identity}`);
          publication.setSubscribed(true);
        }
        return;
      }

      // ✅ ALWAYS subscribe to screen share audio
      if (publication.source === Track.Source.ScreenShareAudio) {
        if (!publication.isSubscribed) {
          console.log(`🔊 [Dynamic Sub] Screen share audio - SUBSCRIBING: ${participant.identity}`);
          publication.setSubscribed(true);
        }
        return;
      }

      // Filter microphone audio based on mode and proximity
      if (publication.kind === 'audio') {
        const speakerUserId = parseInt(participant.identity.split('-')[1]);
        const shouldSubscribe = shouldSubscribeToSpeaker(speakerUserId);

        if (publication.isSubscribed !== shouldSubscribe) {
          console.log(`🔄 [Dynamic Sub] ${participant.identity} → setSubscribed(${shouldSubscribe})`);
          publication.setSubscribed(shouldSubscribe);
        }
      }
    };

    // ✅ STEP 1: Process ALL existing tracks (catch already-published tracks)
    let existingTrackCount = 0;
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        processTrackPublication(publication, participant);
        existingTrackCount++;
      });
    });
    
    console.log(`✅ [Dynamic Sub] Processed ${existingTrackCount} existing tracks`);

    // ✅ STEP 2: Listen for future track publications
    const handleTrackPublished = (publication, participant) => {
      console.log(`🆕 [Dynamic Sub] New track published: ${participant.identity} (${publication.kind})`);
      processTrackPublication(publication, participant);
    };

    room.on(RoomEvent.TrackPublished, handleTrackPublished);

    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished);
      console.log('🧹 [Dynamic Subscription] Cleaned up');
    };
  }, [room, audioMode, userSeats, currentUser?.id, getRowFromSeat, isHostBroadcasting, roomMembers]);

  // 🔄 Re-subscribe when host broadcast toggles (force subscription to broadcasting host)
  useEffect(() => {
    if (!room || audioMode !== 'seat') return;
    
    console.log('🔄 [Host Broadcast Toggle] Re-evaluating subscriptions - isHostBroadcasting:', isHostBroadcasting);
    
    room.remoteParticipants.forEach((participant) => {
      const userId = participant.identity.replace(/^user-/, '').split('-')[0];
      const userIdNum = parseInt(userId);
      const member = roomMembers.find(m => m.id === userIdNum);
      const participantIsHost = member && room.metadata?.host_id === member.id;
      
      if (participantIsHost) {
        console.log(`🎙️ [Host Broadcast] Found host participant: ${participant.identity}`);
        
        participant.audioTrackPublications.forEach(pub => {
          // Filter only microphone audio (not screen share audio - that's always subscribed)
          if (pub.kind === 'audio' && pub.source !== Track.Source.ScreenShareAudio) {
            const shouldSubscribe = isHostBroadcasting || shouldSubscribeToSpeaker(userId);
            
            if (pub.isSubscribed !== shouldSubscribe) {
              console.log(`🔄 [Host Broadcast] ${participant.identity} → setSubscribed(${shouldSubscribe})`);
              pub.setSubscribed(shouldSubscribe);
            }
          }
        });
      }
    });
  }, [isHostBroadcasting, room, audioMode, roomMembers]);

  // 🎤 Publish cinema audio stream to LiveKit
  const publishedAudioTrackRef = useRef(null);

  useEffect(() => {
    if (!room || !localParticipant || !cinemaLocalStream || !isLiveKitConnected) {
      console.log('⏳ [LiveKit Audio Publish] Waiting...', {
        hasRoom: !!room,
        hasParticipant: !!localParticipant,
        hasStream: !!cinemaLocalStream,
        isConnected: isLiveKitConnected
      });
      return;
    }

    const audioTrack = cinemaLocalStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn('⚠️ [LiveKit Audio Publish] No audio track in stream');
      return;
    }

    // ✅ Only publish when user has explicitly unmuted (isAudioActive === true)
    if (cinemaAudioActive && !publishedAudioTrackRef.current) {
      console.log('🟢 [LiveKit Mic Publish] Publishing microphone track');
      console.log('  Audio mode:', audioMode, '| Row:', Object.keys(userSeats).map(uid => userSeats[uid])[0]);

      localParticipant.publishTrack(audioTrack, {
        source: 'microphone',
        name: 'microphone',
      })
        .then((publication) => {
          publishedAudioTrackRef.current = publication;
          console.log('✅ [LiveKit Audio Publish] Track published:', publication.trackSid);
          console.log('  Publication details:', {
            isMuted: publication.isMuted,
            kind: publication.kind,
            source: publication.source,
          });
        })
        .catch(err => {
          console.error('❌ [LiveKit Audio Publish] Failed to publish audio:', err);
          toast.error('Failed to publish audio');
        });
    }

    // ✅ Unpublish when user mutes
    if (!cinemaAudioActive && publishedAudioTrackRef.current && audioTrack) {
      console.log('🔇 [LiveKit Audio Publish] User muted - unpublishing audio track');
      
      const publicationToUnpublish = publishedAudioTrackRef.current;
      publishedAudioTrackRef.current = null;
      
      localParticipant.unpublishTrack(audioTrack)
        .then(() => {
          console.log('✅ [LiveKit Audio Publish] Audio track unpublished (muted)');
        })
        .catch(err => {
          console.error('⚠️ [LiveKit Audio Publish] Error unpublishing track:', err);
        });
    }

    // Cleanup: unpublish only on component unmount
    return () => {
      if (publishedAudioTrackRef.current && audioTrack) {
        console.log('🔇 [LiveKit Audio Publish] Component unmounting - unpublishing audio track');
        
        const publicationToUnpublish = publishedAudioTrackRef.current;
        publishedAudioTrackRef.current = null;
        
        localParticipant.unpublishTrack(audioTrack)
          .then(() => {
            console.log('✅ [LiveKit Audio Publish] Audio track unpublished');
            // Note: Don't call audioTrack.stop() here - it's managed by useCinemaAudio hook
          })
          .catch(err => {
            console.error('⚠️ [LiveKit Audio Publish] Error unpublishing track:', err);
          });
      }
    };
  }, [room, localParticipant, cinemaLocalStream, audioMode, isLiveKitConnected, cinemaAudioActive]);

  // 🎤 Wrap cinema audio toggle to sync with old isAudioActive state
  const toggleAudio = useCallback(() => {
    cinemaToggleAudio(); // Toggle via hook
    // The hook's localStream will trigger LiveKit publishing via useEffect above
  }, [cinemaToggleAudio]);

  // Sync cinemaAudioActive to isAudioActive for backward compatibility
  useEffect(() => {
    setIsAudioActive(cinemaAudioActive);
  }, [cinemaAudioActive]);

  // Preload current media
  useEffect(() => {
    if (currentMedia?.mediaUrl) {
      const video = document.createElement('video');
      video.src = currentMedia.mediaUrl;
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.load();
    }
  }, [currentMedia?.mediaUrl]);

  // 🎤 Enumerate audio devices
  useEffect(() => {
    const getAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        console.log('🎤 [CinemaScene3D] Available audio devices:', audioInputs);
        setAudioDevices(audioInputs);
        
        // Set default device if none selected
        if (!selectedAudioDeviceId && audioInputs.length > 0) {
          setSelectedAudioDeviceId(audioInputs[0].deviceId);
          console.log('🎤 [CinemaScene3D] Default audio device selected:', audioInputs[0].label);
        }
      } catch (err) {
        console.error('❌ [CinemaScene3D] Failed to enumerate audio devices:', err);
      }
    };

    getAudioDevices();

    // Update device list when devices change
    navigator.mediaDevices.addEventListener('devicechange', getAudioDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getAudioDevices);
  }, [selectedAudioDeviceId]);

  // Full screen view of cinemascreen
  const toggleImmersiveMode = () => {
    setIsImmersiveMode(prev => !prev);
  };

  // 🎬 Handle clicking 3D screen to trigger fullscreen video player
  const handleScreenClick = () => {
    // Only trigger if media OR game is active
    const hasMedia = currentMedia || remoteScreenTrack || remoteCameraTrack || localScreenTrack || currentGame;
    const isMediaActive = isPlaying || remoteScreenTrack || remoteCameraTrack || localScreenTrack || currentGame;
    
    if (hasMedia && isMediaActive) {
      console.log('🖱️ [CinemaScene3D] Screen clicked - entering immersive mode', {
        hasCurrentMedia: !!currentMedia,
        hasGame: !!currentGame,
        hasVideoTracks: !!(remoteScreenTrack || remoteCameraTrack || localScreenTrack)
      });
      setIsImmersiveMode(true);
    } else {
      console.log('⚠️ [CinemaScene3D] Screen clicked but no media/game active', {
        currentMedia: !!currentMedia,
        currentGame: !!currentGame,
        isPlaying
      });
    }
  };

  // Seat swap logic
  const {
    seatSwapRequest,
    handleSeatSwapMessage,
    sendSwapRequest,
    acceptSwap,
    declineSwap,
  } = useSeatSwap({
    sendMessage,
    currentUser,
    onSwapAccepted: (data) => {
      // Optional: trigger seat update or camera move
      console.log('Seat swap accepted:', data);
    }
  });

  // Timed view guidance overlay
  const [viewGuidanceMode, setViewGuidanceMode] = useState(null);
  const [viewGuidanceExpiresAt, setViewGuidanceExpiresAt] = useState(0);

  // Show initial guidance on seat assignment
  useEffect(() => {
    if (currentSeat) {
      setViewGuidanceMode('initial');
      setViewGuidanceExpiresAt(Date.now() + 3_000); // 3 seconds
    }
  }, [currentSeat]);

  // 🎭 Fetch theaters when session starts
  useEffect(() => {
    if (sessionStatus?.id) {
      fetchTheaters();
    }
  }, [sessionStatus?.id]);

  // Handle C/R/L/F keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (Date.now() >= viewGuidanceExpiresAt) return;

      if (key === 'c' || key === 'r') {
        setViewGuidanceMode('post-key');
        setViewGuidanceExpiresAt(Date.now() + 3_000); // 3 seconds
      } else if (key === 'l' || key === 'f') {
        setViewGuidanceExpiresAt(Date.now() + 3_000); // 3 seconds
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewGuidanceExpiresAt]);

  // Auto-hide expired guidance
  useEffect(() => {
    if (viewGuidanceExpiresAt === 0) return;
    const checkTimer = () => {
      if (Date.now() >= viewGuidanceExpiresAt) {
        setViewGuidanceMode(null);
        setViewGuidanceExpiresAt(0);
      }
    };
    const interval = setInterval(checkTimer, 1000);
    checkTimer();
    return () => clearInterval(interval);
  }, [viewGuidanceExpiresAt]);

  // Auto assign user seat on mount
  useEffect(() => {
    if (currentUser && !currentSeatKey) {
      const assignedSeat = assignUserToSeat(currentUser.id);
      const seatKey = `${assignedSeat.row - 1}-${assignedSeat.seatInRow - 1}`; // 0-based
      jumpToSeat(seatKey);
    }
  }, [currentUser, currentSeatKey, jumpToSeat]);

  // Update keyboard handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input/textarea/select or contenteditable
      const activeElement = document.activeElement;
      if (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.isContentEditable
      ) return;
      
      // 🚫 Don't trigger camera controls when chat is open (except ESC to close modals)
      if ((isChatOpen || showChatHome) && e.key !== 'Escape') return;
      
      // 🎯 Toggle Position Calculator with P key
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowPositionCalculator(prev => {
          const newState = !prev;
          console.log('🎯 Position Calculator toggled:', newState);
          if (newState) {
            // Opening calculator - save current lock state and unlock view
            setViewLockedBeforeCalculator(isViewLocked);
            setIsViewLocked(false);
            console.log('🔓 View unlocked for free camera movement');
          } else {
            // Closing calculator - restore previous lock state
            setIsViewLocked(viewLockedBeforeCalculator);
            console.log('🔒 View lock restored');
          }
          return newState;
        });
        return;
      }
      
      // 📋 Export logs with L key
      if (e.key.toLowerCase() === 'l' && e.ctrlKey) {
        e.preventDefault();
        handleExportLogs();
        return;
      }
      
      // 🎯 Toggle Seat Position Markers with M key
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowSeatMarkers(prev => {
          const newState = !prev;
          console.log('🎯 Seat Markers toggled:', newState);
          toast.success(newState ? '✓ Seat markers visible' : '✗ Seat markers hidden');
          return newState;
        });
        return;
      }
      
      // 🔓 Toggle View Lock with U key (for free navigation)
      if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        setIsViewLocked(prev => {
          const newState = !prev;
          console.log('🔓 View Lock toggled:', newState);
          toast.success(newState ? '🔒 View locked to seat' : '🔓 View unlocked - WASD/CV to move');
          return newState;
        });
        return;
      }
      
      // 🎬 Toggle Seat Preview Modal with T key
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        setShowSeatPreview(prev => {
          const newState = !prev;
          console.log('🎬 Seat Preview toggled:', newState);
          if (!newState) {
            // Reset preview when closing
            setPreviewViewType('center');
          }
          return newState;
        });
        return;
      }
      
      if (e.key.toLowerCase() === 'f') {
        toggleImmersiveMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImmersiveMode, isViewLocked, viewLockedBeforeCalculator, isChatOpen, showChatHome]);

  // Keyboard binding for full screen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isImmersiveMode) {
        setIsImmersiveMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImmersiveMode]);

  // Fetch media items - SESSION-SPECIFIC (not all room media)
  const fetchAndGeneratePosters = useCallback(async () => {
    console.log('📥 [PLAYLIST FETCH] Starting fetch...', {
      roomId,
      currentUserId: currentUser?.id,
      sessionId: finalSessionId,
      hasAllParams: !!(roomId && currentUser && finalSessionId)
    });
    
    if (!roomId || !currentUser || !finalSessionId) {
      console.warn('⚠️ [PLAYLIST FETCH] Missing required parameters, skipping fetch');
      return;
    }
    
    try {
      // ✅ Use session-specific endpoint to only fetch media for THIS session
      console.log(`📡 [PLAYLIST FETCH] Calling getSessionTemporaryMedia for session ${finalSessionId}`);
      const mediaItems = await getSessionTemporaryMedia(finalSessionId);
      console.log(`✅ [PLAYLIST FETCH] Received ${mediaItems.length} media items:`, mediaItems);
      
      const normalized = mediaItems.map(item => ({
        ...item,
        ID: item.ID || item.id,
        poster_url: item.poster_url || '/icons/placeholder-poster.jpg'
      }));
      
      console.log(`🔄 [PLAYLIST FETCH] Setting playlist with ${normalized.length} normalized items`);
      setPlaylist(normalized);
      console.log('✅ [PLAYLIST FETCH] Playlist state updated successfully');
    } catch (err) {
      console.error("❌ [PLAYLIST FETCH] Failed to fetch media:", err);
      console.error("❌ [PLAYLIST FETCH] Error details:", {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
      setPlaylist([]);
    }
  }, [roomId, currentUser, finalSessionId]);

  // Fetch on mount
  useEffect(() => {
    console.log('🎬 [PLAYLIST] Fetching playlist on mount...');
    fetchAndGeneratePosters();
  }, [fetchAndGeneratePosters]);
  
  // 🐛 DEBUG: Track playlist state changes
  useEffect(() => {
    console.log('📝 [PLAYLIST STATE] Playlist changed:', {
      count: playlist.length,
      items: playlist.map(item => ({
        ID: item.ID,
        title: item.original_name || item.title,
        type: item.type,
        mediaUrl: item.mediaUrl || item.file_url
      })),
      timestamp: new Date().toISOString()
    });
  }, [playlist]);

  // ✅ Also fetch session status on mount (like VideoWatch)
  useEffect(() => {
    if (roomId && sessionIdFromUrl) {
      // Optional: validate session ID with backend
      // But WebSocket will sync state anyway
    }
  }, [roomId, sessionIdFromUrl]);
  // logging
  useEffect(() => {
    // console.log('🎭 roomMembers:', roomMembers);
    //console.log('🤖 Demo users:', roomMembers.filter(u => u.is_demo));
  }, [roomMembers]);

  // 👇 Fill all 42 cinema seats with demo avatars for testing
  useEffect(() => {
    if (!showDemoAvatars) return;

    const demoUsers = [];
    const newSeats = {}; // 👈 track seat assignments

    // All 6 rows (0-5), 7 seats per row (0-6) = 42 seats total
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++) {
        const demoId = `demo-${row}-${col}`;
        demoUsers.push({
          id: demoId,
          username: `R${row + 1}S${col + 1}`, // Row 1-6, Seat 1-7
          user_role: 'viewer',
          is_demo: true,
          avatar_url: '/icons/user1avatar.svg'
        });
        // 👇 Assign seat in userSeats format
        newSeats[demoId] = `${row}-${col}`;
      }
    }
    setRoomMembers(prev => {
      const existingIds = new Set(prev.map(u => u.id));
      const newUsers = demoUsers.filter(u => !existingIds.has(u.id));
      return [...prev, ...newUsers];
    });

    // 👇 Update userSeats with demo assignments
    setUserSeats(prev => ({ ...prev, ...newSeats }));
  }, [showDemoAvatars]);

  // 🔄 Request fresh seat state when seat modal opens or members modal opens
  useEffect(() => {
    if ((isSeatGridModalOpen || isMembersModalOpen) && sendMessage && isConnected) {
      console.log('🔄 [CinemaScene3D] Modal opened - requesting fresh seat state');
      sendMessage({ type: 'request_seat_state' });
    }
  }, [isSeatGridModalOpen, isMembersModalOpen, sendMessage, isConnected]);

  // Local track
  useEffect(() => {
    if (!localParticipant) return;
    const pub = (localParticipant.videoTrackPublications || new Map()).get('screen_share');
    if (pub?.track) setLocalScreenTrack(pub.track);
    const handle = (p) => p.source === Track.Source.ScreenShare && setLocalScreenTrack(p.track);
    localParticipant.on(ParticipantEvent.TrackPublished, handle);
    return () => localParticipant.off(ParticipantEvent.TrackPublished, handle);
  }, [localParticipant]);

  // Remote track detection (screen share + camera for LiveShare)
  useEffect(() => {
    if (!room) return;

    const checkRemoteTracks = () => {
      const participants = Array.from(room.remoteParticipants.values());
      console.log('🔍 [LIVESHARE MEMBER] Checking remote tracks from', participants.length, 'participants');
      
      const allPubs = participants.flatMap(p => {
        const pubs = Array.from((p.videoTrackPublications || new Map()).values());
        console.log('  👤 Participant:', p.identity, 'has', pubs.length, 'video publications');
        return pubs;
      });
      
      console.log('📊 [LIVESHARE MEMBER] Total video publications:', allPubs.length);
      allPubs.forEach(pub => {
        console.log('    📹 Publication:', {
          source: pub.source,
          kind: pub.kind,
          trackSid: pub.trackSid,
          hasTrack: !!pub.track,
          isSubscribed: pub.isSubscribed
        });
      });
      
      // Detect screen share track
      const screenPub = allPubs.find(pub => pub.source === Track.Source.ScreenShare);
      const screenTrack = screenPub?.track || null;
      setRemoteScreenTrack(screenTrack);
      
      // Detect camera track (for LiveShare camera-only mode)
      const cameraPub = allPubs.find(pub => pub.source === Track.Source.Camera);
      const cameraTrack = cameraPub?.track || null;
      setRemoteCameraTrack(cameraTrack);
      
      if (screenTrack) {
        console.log('✅ [LIVESHARE MEMBER] Screen share track SET:', {
          trackSid: screenPub.trackSid,
          enabled: screenTrack.isEnabled,
          muted: screenTrack.isMuted,
          hasMediaStreamTrack: !!screenTrack.mediaStreamTrack
        });
      } else {
        console.log('❌ [LIVESHARE MEMBER] No screen share track found');
      }
      
      if (cameraTrack) {
        console.log('✅ [LIVESHARE MEMBER] Camera track SET:', {
          trackSid: cameraPub.trackSid,
          enabled: cameraTrack.isEnabled,
          muted: cameraTrack.isMuted,
          hasMediaStreamTrack: !!cameraTrack.mediaStreamTrack
        });
      }
    };

    // Check on mount
    checkRemoteTracks();

    // ✅ Subscribe to any existing video tracks
    room.remoteParticipants.forEach((participant) => {
      participant.videoTrackPublications.forEach((publication) => {
        if (!publication.isSubscribed) {
          console.log('📹 [LIVESHARE MEMBER] Subscribing to existing video track:', {
            participant: participant.identity,
            trackSid: publication.trackSid,
            source: publication.source
          });
          publication.setSubscribed(true);
        }
      });
    });

    // Listen for track publications
    const handleTrackPublished = (publication, participant) => {
      console.log('🎬 [LIVESHARE MEMBER] Track published:', {
        source: publication.source,
        kind: publication.kind,
        trackSid: publication.trackSid,
        participant: participant.identity,
        isSubscribed: publication.isSubscribed
      });
      
      // ✅ Subscribe to all video tracks (screen share, camera)
      if (publication.kind === 'video') {
        console.log('📹 [LIVESHARE MEMBER] Subscribing to video track:', publication.trackSid);
        publication.setSubscribed(true);
      }
      
      checkRemoteTracks();
    };

    const handleTrackSubscribed = (track, publication, participant) => {
      console.log('🎬 [LIVESHARE MEMBER] Track subscribed:', {
        source: publication.source,
        kind: publication.kind,
        trackSid: publication.trackSid,
        participant: participant.identity,
        trackEnabled: track.isEnabled,
        trackMuted: track.isMuted
      });
      checkRemoteTracks();
    };

    const handleTrackUnpublished = (publication, participant) => {
      console.log('🎬 [LIVESHARE MEMBER] Track unpublished:', {
        source: publication.source,
        trackSid: publication.trackSid,
        participant: participant.identity
      });
      checkRemoteTracks();
    };

    // Attach listeners
    room.on(RoomEvent.TrackPublished, handleTrackPublished);
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);

    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished);
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnpublished, handleTrackUnpublished);
    };
  }, [room]);

  // ✅ MEMBER: Create video elements from remote LiveKit tracks
  useEffect(() => {
    if (!remoteScreenTrack && !remoteCameraTrack) {
      // No remote tracks - cleanup
      if (liveShareVideoRef.current) {
        console.log('🧹 [LIVESHARE MEMBER] Cleaning up screen video element');
        liveShareVideoRef.current.pause();
        liveShareVideoRef.current.srcObject = null;
        if (document.body.contains(liveShareVideoRef.current)) {
          document.body.removeChild(liveShareVideoRef.current);
        }
        liveShareVideoRef.current = null;
        setRemoteScreenStream(null);
      }
      if (liveShareCameraVideoRef.current) {
        console.log('🧹 [LIVESHARE MEMBER] Cleaning up camera video element');
        liveShareCameraVideoRef.current.pause();
        liveShareCameraVideoRef.current.srcObject = null;
        if (document.body.contains(liveShareCameraVideoRef.current)) {
          document.body.removeChild(liveShareCameraVideoRef.current);
        }
        liveShareCameraVideoRef.current = null;
        setRemoteCameraStream(null);
      }
      // Clear liveShareMode
      if (liveShareMode) {
        console.log('🧹 [LIVESHARE MEMBER] Clearing liveShareMode');
        setLiveShareMode(null);
      }
      return;
    }

    // Determine liveShareMode based on tracks
    let mode = null;
    if (remoteScreenTrack && remoteCameraTrack) {
      mode = 'both';
    } else if (remoteScreenTrack) {
      mode = 'screen';
    } else if (remoteCameraTrack) {
      mode = 'camera';
    }

    if (mode && mode !== liveShareMode) {
      console.log('🎬 [LIVESHARE MEMBER] Setting liveShareMode:', mode);
      setLiveShareMode(mode);
    }

    // Create MediaStream and video element from remote screen track
    if (remoteScreenTrack && !liveShareVideoRef.current) {
      console.log('🎥 [LIVESHARE MEMBER] Creating video element for remote screen track');
      const screenVideo = document.createElement('video');
      screenVideo.playsInline = true;
      screenVideo.autoplay = true;
      screenVideo.muted = true;
      
      // 🔥 Low-latency optimizations (reduce 3-4s lag to <1s)
      screenVideo.setAttribute('preload', 'none'); // No buffering
      screenVideo.setAttribute('disablePictureInPicture', 'true');
      
      // WebKit/Safari low-latency mode
      if (screenVideo.webkitSetPresentationMode) {
        screenVideo.webkitSetPresentationMode('inline');
      }
      
      screenVideo.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
      
      // Create MediaStream from LiveKit track
      const mediaStream = new MediaStream([remoteScreenTrack.mediaStreamTrack]);
      screenVideo.srcObject = mediaStream;
      
      // Store MediaStream in state for fullscreen
      setRemoteScreenStream(mediaStream);
      
      // Append to DOM and store ref
      document.body.appendChild(screenVideo);
      liveShareVideoRef.current = screenVideo;
      
      // ✅ Wait for video metadata before playing to prevent 2x2 pixel black screen
      screenVideo.addEventListener('loadedmetadata', () => {
        console.log('📊 [LIVESHARE MEMBER] Screen video metadata loaded:', {
          videoWidth: screenVideo.videoWidth,
          videoHeight: screenVideo.videoHeight,
          readyState: screenVideo.readyState
        });
        
        screenVideo.play()
          .then(() => {
            console.log('✅ [LIVESHARE MEMBER] Screen video playing:', {
              videoWidth: screenVideo.videoWidth,
              videoHeight: screenVideo.videoHeight,
              currentTime: screenVideo.currentTime,
              readyState: screenVideo.readyState
            });
          })
          .catch(err => console.error('❌ [LIVESHARE MEMBER] Screen video play failed:', err));
      }, { once: true });
    }

    // Create MediaStream and video element from remote camera track
    if (remoteCameraTrack && !liveShareCameraVideoRef.current) {
      console.log('📹 [LIVESHARE MEMBER] Creating video element for remote camera track');
      const cameraVideo = document.createElement('video');
      cameraVideo.playsInline = true;
      cameraVideo.autoplay = true;
      cameraVideo.muted = true;
      
      // 🔥 Low-latency optimizations (reduce 3-4s lag to <1s)
      cameraVideo.setAttribute('preload', 'none'); // No buffering
      cameraVideo.setAttribute('disablePictureInPicture', 'true');
      
      // WebKit/Safari low-latency mode
      if (cameraVideo.webkitSetPresentationMode) {
        cameraVideo.webkitSetPresentationMode('inline');
      }
      
      cameraVideo.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
      
      // Create MediaStream from LiveKit track
      const mediaStream = new MediaStream([remoteCameraTrack.mediaStreamTrack]);
      cameraVideo.srcObject = mediaStream;
      
      // Store MediaStream in state for fullscreen
      setRemoteCameraStream(mediaStream);
      
      // Append to DOM and store ref
      document.body.appendChild(cameraVideo);
      liveShareCameraVideoRef.current = cameraVideo;
      
      // ✅ Wait for video metadata before playing to prevent 2x2 pixel black screen
      cameraVideo.addEventListener('loadedmetadata', () => {
        console.log('📊 [LIVESHARE MEMBER] Camera video metadata loaded:', {
          videoWidth: cameraVideo.videoWidth,
          videoHeight: cameraVideo.videoHeight,
          readyState: cameraVideo.readyState
        });
        
        cameraVideo.play()
          .then(() => {
            console.log('✅ [LIVESHARE MEMBER] Camera video playing:', {
              videoWidth: cameraVideo.videoWidth,
              videoHeight: cameraVideo.videoHeight,
              currentTime: cameraVideo.currentTime
            });
            // Trigger canvas compositor for podcast mode
            setCameraVideoReady(true);
          })
          .catch(err => console.error('❌ [LIVESHARE MEMBER] Camera video play failed:', err));
      }, { once: true });
    }

    return () => {
      // Cleanup on unmount
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
    };
  }, [remoteScreenTrack, remoteCameraTrack]);

  // 🎙️ Podcast Canvas Compositor - Draws video + overlays for 3D screen
  useEffect(() => {
    const isPodcastMode = podcastConfig?.mode === 'podcast';
    const cameraVideo = liveShareCameraVideoRef.current;
    
    console.log('🎨 [PODCAST] Canvas effect triggered:', { isPodcastMode, hasCameraVideo: !!cameraVideo, cameraVideoReady });
    
    if (!isPodcastMode || !cameraVideo || !cameraVideoReady) {
      // Clear canvas when not in podcast mode
      if (podcastCanvasRef.current && !isPodcastMode) {
        const canvas = podcastCanvasRef.current;
        if (document.body.contains(canvas)) {
          document.body.removeChild(canvas);
        }
        podcastCanvasRef.current = null;
        console.log('🗑️ [PODCAST] Canvas cleared');
      }
      return;
    }
    
    console.log('🎨 [PODCAST] Starting canvas compositor');
    
    // Create canvas if it doesn't exist
    if (!podcastCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      canvas.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
      document.body.appendChild(canvas);
      podcastCanvasRef.current = canvas;
      console.log('✅ [PODCAST] Canvas created');
    }
    
    // Preload logo image
    if (podcastConfig.logoUrl && !podcastLogoImageRef.current) {
      console.log('📦 [PODCAST] Loading logo:', podcastConfig.logoUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = podcastConfig.logoUrl;
      img.onload = () => {
        console.log('✅ [PODCAST] Logo loaded:', img.width, 'x', img.height);
        podcastLogoImageRef.current = img;
      };
      img.onerror = (err) => {
        console.error('❌ [PODCAST] Logo load failed:', err, podcastConfig.logoUrl);
      };
    }
    
    const canvas = podcastCanvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let frameCount = 0;
    
    const drawFrame = () => {
      if (cameraVideo.readyState >= cameraVideo.HAVE_CURRENT_DATA) {
        // Match canvas size to video
        if (canvas.width !== cameraVideo.videoWidth || canvas.height !== cameraVideo.videoHeight) {
          canvas.width = cameraVideo.videoWidth || 1920;
          canvas.height = cameraVideo.videoHeight || 1080;
          console.log('📐 [PODCAST] Canvas resized:', canvas.width, 'x', canvas.height);
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw video frame
        ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
        
        // Draw overlays on top
        const scale = canvas.width / 1920; // Scale overlays to video resolution
        
        // LIVE indicator (top center)
        ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
        ctx.beginPath();
        const liveWidth = 120 * scale;
        const liveHeight = 40 * scale;
        const liveX = canvas.width / 2 - liveWidth / 2;
        const liveY = 20 * scale;
        ctx.roundRect(liveX, liveY, liveWidth, liveHeight, 20 * scale);
        ctx.fill();
        
        // LIVE text
        ctx.fillStyle = 'white';
        ctx.font = `bold ${16 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔴 LIVE', canvas.width / 2, liveY + liveHeight / 2);
        
        // Host label (top left)
        const hostText = `${podcastConfig.hostUsername || 'Host'} (Host)`;
        ctx.font = `${16 * scale}px sans-serif`;
        ctx.textAlign = 'left';
        const hostTextWidth = ctx.measureText(hostText).width;
        const hostBoxWidth = hostTextWidth + 40 * scale;
        const hostBoxHeight = 40 * scale;
        const hostX = 20 * scale;
        const hostY = 20 * scale;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.roundRect(hostX, hostY, hostBoxWidth, hostBoxHeight, 10 * scale);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.fillText(hostText, hostX + 20 * scale, hostY + hostBoxHeight / 2);
        
        // Logo (bottom left above title) - load position and size from localStorage
        if (podcastLogoImageRef.current) {
          // Load custom logo styles from localStorage
          let logoSize = 100; // Default size
          let logoX = 10; // Default X position
          let logoY = 80; // Default Y position (from bottom)
          
          try {
            const savedLogoStyles = localStorage.getItem(`podcast_logo_style_${podcastConfig.sessionId || sessionId}`);
            if (savedLogoStyles) {
              const styles = JSON.parse(savedLogoStyles);
              logoSize = styles.size || 100;
              logoX = styles.x || 10;
              logoY = styles.y || 80;
            }
          } catch (err) {
            console.warn('Failed to load logo styles:', err);
          }
          
          const scaledLogoSize = logoSize * scale;
          const scaledLogoX = logoX * scale;
          const scaledLogoY = canvas.height - (logoY * scale) - scaledLogoSize; // Convert from bottom to top
          
          // Draw logo image
          ctx.drawImage(podcastLogoImageRef.current, scaledLogoX, scaledLogoY, scaledLogoSize, scaledLogoSize);
        }
        
        // Title (bottom left with custom styling)
        if (podcastConfig.title) {
          // Load custom styles from localStorage
          let titleColor = 'white';
          let titleSize = 24;
          let titleWeight = 700;
          let titleCase = 'none';
          
          try {
            const savedStyles = localStorage.getItem(`podcast_title_style_${podcastConfig.sessionId || sessionId}`);
            if (savedStyles) {
              const styles = JSON.parse(savedStyles);
              titleColor = styles.color || 'white';
              titleSize = styles.size || 24;
              titleWeight = styles.weight || 700;
              titleCase = styles.case || 'none';
            }
          } catch (err) {
            console.warn('Failed to load title styles:', err);
          }
          
          // Apply text case transformation
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
          
          // Map weight to CSS font-weight keyword
          const fontWeightMap = {
            300: 'lighter',
            400: 'normal',
            500: '500',
            700: 'bold',
            800: 'bolder'
          };
          const fontWeightKeyword = fontWeightMap[titleWeight] || 'bold';
          
          ctx.font = `${fontWeightKeyword} ${titleSize * scale}px sans-serif`;
          ctx.textAlign = 'left';
          const titleText = applyTextCase(podcastConfig.title, titleCase);
          const titleTextWidth = ctx.measureText(titleText).width;
          const titleBoxWidth = titleTextWidth + 40 * scale;
          const titleBoxHeight = (titleSize + 20) * scale;
          const titleX = 10 * scale; // 10px from left
          const titleY = canvas.height - titleBoxHeight - 10 * scale; // 10px from bottom
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.beginPath();
          ctx.roundRect(titleX, titleY, titleBoxWidth, titleBoxHeight, 10 * scale);
          ctx.fill();
          
          ctx.fillStyle = titleColor;
          ctx.textBaseline = 'middle';
          ctx.fillText(titleText, titleX + 20 * scale, titleY + titleBoxHeight / 2);
        }
        
        // Log every 60 frames (once per second at 60fps)
        frameCount++;
        if (frameCount % 60 === 0) {
          console.log('🎞️ [PODCAST] Drawing frame', frameCount, 'Logo loaded:', !!podcastLogoImageRef.current);
        }
      }
      
      animationFrameId = requestAnimationFrame(drawFrame);
    };
    
    // Start drawing loop
    drawFrame();
    
    // Update video texture to use canvas instead of video element
    if (videoTextureUpdateRef.current) {
      console.log('🔄 [PODCAST] Switching 3D screen texture to canvas');
      videoTextureUpdateRef.current(canvas);
    } else {
      console.warn('⚠️ [PODCAST] videoTextureUpdateRef not available');
    }
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        console.log('🛑 [PODCAST] Canvas compositor stopped');
      }
      // Reset camera video ready flag
      setCameraVideoReady(false);
    };
  }, [podcastConfig, cameraVideoReady]);

  // ✅ Attach uploaded media to hidden <video> for 3D screen texture
  // (LiveShare video elements are created directly in handleStartLiveShare)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Only handle uploaded videos - LiveShare creates its own fresh video elements
    const isUploadMode = currentMedia?.type === 'upload' && currentMedia.mediaUrl;

    if (isUploadMode) {
      // Clean up any previous source
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
      
      const newUrl = currentMedia.mediaUrl;
      if (video.src !== newUrl) {
        video.pause();
        video.src = newUrl;
        video.muted = false;
        video.load();
        video.play().catch(e => console.warn("Play failed (upload):", e));
      }
    } else if (!liveShareMode) {
      // No media and not in LiveShare mode: clear video element
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
      video.src = '';
    }
    // If in LiveShare mode, don't touch videoRef.current - liveShareVideoRef is being used instead

    return () => {
      // Only cleanup if we're switching away from upload mode
      if (isUploadMode && video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
    };
  }, [currentMedia, liveShareMode]);

  // ✅ SHARED VIDEO: Move video element into fullscreen container for upload media
  useEffect(() => {
    const video = videoRef.current;
    const container = fullscreenUploadContainerRef.current;
    
    // Only handle upload media (LiveShare has its own component)
    const isUploadMedia = currentMedia?.type === 'upload';
    if (!video || !isUploadMedia) return;

    if (isImmersiveMode && container) {
      // 🎬 FULLSCREEN MODE: Move video into fullscreen container
      console.log('🎬 [SHARED VIDEO] Moving video into fullscreen container');
      video.style.cssText = 'position: relative; width: 100%; height: 100%; object-fit: contain; background: black;';
      container.appendChild(video);
    } else if (!isImmersiveMode) {
      // 🎭 3D TEXTURE MODE: Move video back to body (hidden)
      console.log('🎭 [SHARED VIDEO] Moving video back to body');
      video.style.cssText = 'position: fixed; width: 100vw; height: 100vh; top: 0; left: 0; object-fit: contain; background: black; opacity: 0; z-index: -1; pointer-events: none;';
      if (video.parentElement !== document.body) {
        document.body.appendChild(video);
      }
    }
  }, [isImmersiveMode, currentMedia?.type]);

  // ✅ Auto-hide fullscreen close button after 2 seconds of inactivity
  useEffect(() => {
    if (!isImmersiveMode) return;

    // Show controls initially when entering fullscreen
    setShowFullscreenControls(true);

    const handleMouseMove = () => {
      setShowFullscreenControls(true);
      
      // Clear existing timer
      if (fullscreenInactivityTimerRef.current) {
        clearTimeout(fullscreenInactivityTimerRef.current);
      }
      
      // Hide controls after 2 seconds of inactivity
      fullscreenInactivityTimerRef.current = setTimeout(() => {
        setShowFullscreenControls(false);
      }, 2000);
    };

    // Add mouse movement listener
    window.addEventListener('mousemove', handleMouseMove);
    
    // Trigger initial timer
    handleMouseMove();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (fullscreenInactivityTimerRef.current) {
        clearTimeout(fullscreenInactivityTimerRef.current);
      }
    };
  }, [isImmersiveMode]);

  // ✅ REMOVED: Duplicate video initialization - now handled in media loading effect
  // ✅ REMOVED: Fullscreen sync effects - no longer needed with shared video element
  // ✅ REMOVED: Sync effects no longer needed - using single shared video element

  // Auto-turn off lights when media starts playing
  useEffect(() => {
    if (isPlaying && lightsOn) {
      setLightsOn(false);
      if (sendMessage) {
        sendMessage({
          type: 'update_lights',
          data: { lightsOn: false }
        });
      }
    }
  }, [isPlaying, lightsOn, sendMessage]);

  // === Load chat history ===
  useEffect(() => {
    if (!roomId || !sessionStatus?.id) return;
    const loadChatHistory = async () => {
      setIsChatLoading(true);
      try {
        const response = await getChatHistory(roomId, sessionStatus.id);
        setSessionChatMessages(response.messages || []);
      } catch (err) {
        console.error('❌ Failed to load chat history:', err);
      } finally {
        setIsChatLoading(false);
      }
    };
    loadChatHistory();
  }, [roomId, sessionStatus?.id]);
 
  // Seat assignment is now handled by backend in response to request_seat_state
  // Backend auto-assigns seats and sends seat_assigned message
  // No client-side auto-assignment needed

  // === Process WebSocket messages ===
  useEffect(() => {
    const newMessages = messages.slice(processedMessageCountRef.current);
    
    // 🎮 [DEBUG] Log ALL incoming WebSocket messages
    newMessages.forEach((msg) => {
      console.log('📨 [WebSocket] Incoming message:', msg.type, msg.action || '', msg);
    });
    
    const memberMessages = newMessages.filter(m => 
      ['participant_join', 'participant_leave', 'session_member_joined', 'session_status'].includes(m.type)
    );
    if (memberMessages.length > 0) {
      console.log(`🔄 [Processing] ${memberMessages.length} member messages`);
    }
    newMessages.forEach((msg) => {
      // ✅ Let the hook handle seat swap messages FIRST
      if (handleSeatSwapMessage(msg)) {
        return; // Hook handled it — skip rest
      }

      // 🎮 Handle game messages
      if (msg.type === 'game') {
        console.log('🎮 [Game Handler 1] Processing game message:', msg.action, { hasCurrentGame: !!currentGame, hasActiveGame: !!activeGame });
        switch (msg.action) {
          case 'game_started':
            console.log('🎮 [game_started] Received game_started message:', msg.data);
            if (msg.data) {
              const gameData = {
                sessionId: msg.data.game_session_id,
                game_type: msg.data.game_type, // ✅ Use game_type for consistency with GameScreenRenderer
                players: msg.data.players,
                game_state: msg.data.game_state, // ✅ Use snake_case to match GameScreenRenderer expectations
                status: 'active', // ✅ Add status for game lifecycle tracking
              };
              console.log('🎮 [game_started] Setting game state:', gameData);
              setCurrentGame(gameData);
              setActiveGame(gameData); // Also update activeGame
              // ✅ Don't show overlay in cinema mode - game shows on 3D screen instead
              // setShowGameOverlay(true); 
              toast.success(`${msg.data.game_type.replace('_', ' ').toUpperCase()} started!`, {
                icon: '🎮',
                duration: 3000,
              });
            }
            break;
            
          case 'game_state_update':
            console.log('🎮 [Game Handler 1] game_state_update:', { 
              hasGameState: !!msg.game_state,
              board: msg.game_state?.board,
              currentTurn: msg.current_turn,
              status: msg.status,
              currentGame, 
              activeGame 
            });
            // Backend sends data at root level, not in msg.data
            // Update BOTH currentGame and activeGame
            if (msg.game_state) {
              if (currentGame) {
                setCurrentGame(prev => ({
                  ...prev,
                  game_state: msg.game_state, // ✅ Use snake_case to match GameScreenRenderer
                  currentTurn: msg.current_turn,
                  status: msg.status, // ✅ Capture status (active/completed)
                  winner_id: msg.winner_id, // ✅ Capture winner if present
                }));
              }
              if (activeGame) {
                setActiveGame(prev => ({
                  ...prev,
                  game_state: msg.game_state, // ✅ Use snake_case to match GameScreenRenderer
                  currentTurn: msg.current_turn,
                  status: msg.status, // ✅ Capture status (active/completed)
                  winner_id: msg.winner_id, // ✅ Capture winner if present
                }));
              }
            }
            break;
            
          case 'game_ended':
            // Don't clear the game - keep it visible with winner info
            const winnerData = msg.data;
            setCurrentGame(prev => prev ? {
              ...prev,
              isGameOver: true,
              winnerId: winnerData?.winner_id,
              reason: winnerData?.reason
            } : null);
            setActiveGame(prev => prev ? {
              ...prev,
              isGameOver: true,
              winnerId: winnerData?.winner_id,
              reason: winnerData?.reason
            } : null);
            break;
        }
        return; // Game message handled
      }

      // ⚠️ All other messages
      switch (msg.type) {
        case 'seat_assigned':
          // 🪑 Backend assigned seat to user
          if (msg.data) {
            const { user_id, seat_id, row, col, theater_number } = msg.data;
            const memberName = roomMembers.find(m => m.id === user_id)?.username || 'unknown';
            console.log(`🎯 [SEAT ASSIGNED] ${memberName} (ID:${user_id}) → Seat ${seat_id} (Row ${row + 1}, Col ${col + 1})${theater_number ? ` in Theater ${theater_number}` : ''}`);
            
            // Update userSeats state for ALL users (not just current user)
            setUserSeats(prev => {
              const updated = {
                ...prev,
                [user_id]: seat_id
              };
              const realUsersCount = Object.keys(updated).filter(k => !k.startsWith('demo')).length;
              console.log(`🪑 [SEAT STATE] Now ${realUsersCount} users seated (Room: ${roomMembers.length} members total)`);
              return updated;
            });
            
            // If this is the current user, jump camera to their seat
            if (user_id === currentUser?.id && jumpToSeat) {
              // Only show loading_scene spinner on initial assignment, not on seat swaps
              if (enableLoadingOverlay && isInitialSeatRequest) {
                setLoadingStatus('loading_scene');
                console.log('⏳ [Spinner] Showing scene load for initial assignment');
              } else if (!isInitialSeatRequest) {
                console.log('⚡ [Spinner] Skipping scene load for seat change (instant jump)');
              }
              
              jumpToSeat(seat_id);
              setHasSeatAssigned(true);
              
              // Mark initial seat request as complete (subsequent requests are seat changes)
              if (isInitialSeatRequest) {
                setIsInitialSeatRequest(false);
                console.log('✅ [Seat] Initial assignment complete - future requests won\'t show spinner');
              }
              
              // 💾 Cache seat assignment (for display only, not re-assignment)
              cacheLastSession(finalSessionId, roomId, seat_id);
              console.log('💾 [Cache] Saved seat assignment to localStorage');
              
              // Hide loading overlay after brief scene load delay (only if shown)
              if (enableLoadingOverlay && isInitialSeatRequest) {
                setTimeout(() => {
                  setLoadingStatus(null);
                  console.log('🎬 [Loading] Scene ready - hiding overlay');
                }, 300); // 0.3 second for scene to render
              }
            }
          }
          break;
        case 'theater_created':
          // 🎭 Show notification when new theater is created
          if (msg.data?.message) {
            toast.success(msg.data.message, {
              duration: 5000,
              icon: '🎭',
            });
          }
          // Refresh theaters list
          fetchTheaters();
          break;
        case 'theater_assigned':
          // 🎭 User assigned to theater
          if (msg.data) {
            console.log('🎭 [CinemaScene3D] Assigned to theater:', msg.data);
            
            // Update userTheaters state
            if (msg.data.user_id && msg.data.theater_number) {
              setUserTheaters(prev => ({
                ...prev,
                [msg.data.user_id]: {
                  theater_number: msg.data.theater_number,
                  seat_row: msg.data.seat_row,
                  seat_col: msg.data.seat_col,
                }
              }));
            }
            
            // Show toast for current user
            if (msg.data.user_id === currentUser?.id) {
              toast.success(`Assigned to ${msg.data.theater_name || 'Theater ' + msg.data.theater_number}`, {
                duration: 3000,
                icon: '🎭',
              });
            }
          }
          break;
        case 'broadcast_request':
          // 🎤 User requested broadcast permission
          if (msg.data && isHost) {
            console.log('🎤 [CinemaScene3D] Broadcast request:', msg.data);
            
            // Add to broadcast requests list
            if (msg.data.user_id && !broadcastRequests.includes(msg.data.user_id)) {
              setBroadcastRequests(prev => [...prev, msg.data.user_id]);
              
              // Show toast notification for host
              const username = msg.data.username || 'A user';
              toast(`${username} is requesting broadcast permission`, {
                duration: 10000,
                icon: '🎤',
                style: {
                  background: '#f97316',
                  color: '#fff',
                },
              });
            }
          }
          break;
        case 'broadcast_granted':
          // ✅ Broadcast permission granted
          if (msg.data && msg.data.user_id) {
            console.log('✅ [CinemaScene3D] Broadcast granted to:', msg.data.user_id);
            
            // Update broadcast permissions
            setBroadcastPermissions(prev => ({
              ...prev,
              [msg.data.user_id]: true
            }));
            
            // Remove from requests list
            setBroadcastRequests(prev => prev.filter(id => id !== msg.data.user_id));
            
            // Show toast for the user who got permission
            if (msg.data.user_id === currentUser?.id) {
              toast.success('You can now broadcast to the whole room!', {
                duration: 5000,
                icon: '🔊',
              });
            }
          }
          break;
        case 'broadcast_revoked':
          // 🚫 Broadcast permission revoked
          if (msg.data && msg.data.user_id) {
            console.log('🚫 [CinemaScene3D] Broadcast revoked from:', msg.data.user_id);
            
            // Update broadcast permissions
            setBroadcastPermissions(prev => ({
              ...prev,
              [msg.data.user_id]: false
            }));
            
            // Show toast for the user who lost permission
            if (msg.data.user_id === currentUser?.id) {
              toast('Your broadcast permission was revoked', {
                duration: 3000,
                icon: '🔇',
              });
            }
          }
          break;
        case 'emote':
          // Play sound when receiving emote from another user
          if (msg.data?.emote) {
            playEmoteSound(msg.data.emote, 0.5);
          }
          break;
        case 'chat_message':
          console.log('💬 [chat_message] Received:', { 
            sessionId: msg.data.session_id, 
            currentSessionId: sessionStatus?.id,
            userId: msg.data.UserID, // ✅ Backend sends capital case
            message: msg.data.Message, // ✅ Backend sends capital case
            hasTriggerRef: !!triggerChatBubbleRef.current
          });
          
          if (msg.data.session_id === sessionStatus?.id || !sessionStatus?.id) {
            setSessionChatMessages(prev => {
              const exists = prev.some(m => m.ID === msg.data.ID);
              return exists ? prev : [...prev, { ...msg.data, reactions: msg.data.reactions || [] }];
            });
            
            // 💬 Trigger chat bubble above avatar (use capital case field names from backend)
            if (msg.data.UserID && msg.data.Message) {
              // Find user's color (from roomMembers or generate)
              const user = roomMembers.find(m => m.id === msg.data.UserID);
              let userColor = user?.avatar_color;
              if (!userColor) {
                // Generate color based on user ID if not available
                const hue = (msg.data.UserID * 137.5) % 360;
                userColor = `hsl(${hue}, 65%, 50%)`;
              }
              
              console.log('💬 [chat_message] Triggering bubble:', { 
                userId: msg.data.UserID, 
                color: userColor,
                hasCallback: !!triggerChatBubbleRef.current,
                messageData: {
                  user_id: msg.data.UserID,
                  message: msg.data.Message,
                  username: msg.data.Username,
                  avatar_color: userColor
                }
              });
              
              if (triggerChatBubbleRef.current) {
                console.log('💬 [chat_message] CALLING callback now...');
                triggerChatBubbleRef.current({
                  user_id: msg.data.UserID, // ✅ Map to lowercase for avatar manager
                  message: msg.data.Message, // ✅ Map to lowercase for avatar manager
                  username: msg.data.Username || `User${msg.data.UserID}`,
                  avatar_color: userColor
                });
                console.log('💬 [chat_message] Callback COMPLETED');
              } else {
                console.warn('💬 [chat_message] triggerChatBubbleRef.current is null!');
              }
            }
          } else {
            console.log('💬 [chat_message] Skipped - session mismatch');
          }
          break;
       
        case 'update_lights':
          if (msg.data?.lightsOn !== undefined) {
            setLightsOn(msg.data.lightsOn);
            // ✅ Update sessionStorage when receiving broadcast
            try {
              sessionStorage.setItem(`cinema_lights_${roomId}`, JSON.stringify(msg.data.lightsOn));
            } catch (err) {
              console.warn('Failed to save lights state:', err);
            }
          }
          break;
        
        case 'darkness_level_changed':
          if (msg.data?.darknessLevel) {
            setDarknessLevel(msg.data.darknessLevel);
            // ✅ Update sessionStorage when receiving broadcast
            try {
              sessionStorage.setItem(`cinema_darkness_level_${roomId}`, JSON.stringify(msg.data.darknessLevel));
            } catch (err) {
              console.warn('Failed to save darkness level:', err);
            }
          }
          break;
        
        case 'request_room_state':
          // ✅ Host responds with current room state
          if (isHost && msg.data?.user_id && msg.data.user_id !== currentUser?.id) {
            console.log('🔄 [Lights] Host sending room state to user:', msg.data.user_id);
            sendMessage({
              type: 'sync_room_state',
              data: {
                lightsOn: lightsOn,
                target_user_id: msg.data.user_id
              }
            });
          }
          break;
        
        case 'sync_room_state':
          // ✅ Receive room state sync (for new joiners or after refresh)
          if (!msg.data?.target_user_id || msg.data.target_user_id === currentUser?.id) {
            if (msg.data?.lightsOn !== undefined) {
              console.log('✅ [Lights] Synced room state:', msg.data.lightsOn);
              setLightsOn(msg.data.lightsOn);
              // ✅ Update sessionStorage
              try {
                sessionStorage.setItem(`cinema_lights_${roomId}`, JSON.stringify(msg.data.lightsOn));
              } catch (err) {
                console.warn('Failed to save lights state:', err);
              }
            }
          }
          break;
        case 'take_seat':
          if (msg.user_id && msg.seat_id) {
            // console.log('🪑 [CinemaScene3D] Received take_seat broadcast:', {
            //   user_id: msg.user_id,
            //   seat_id: msg.seat_id,
            //   isCurrentUser: msg.user_id === currentUser?.id
            // });
            setUserSeats(prev => {
              const updated = {
                ...prev,
                [msg.user_id]: msg.seat_id
              };
              // console.log('🪑 [CinemaScene3D] Updated userSeats:', updated);
              return updated;
            });
          }
          break;
        case "request_playback_state":
          console.log('📨 [3D Cinema] Received playback state request:', {
            requester_id: msg.requester_id,
            isHost,
            currentMedia: currentMedia?.file_path
          });
          
          // Only host responds to state requests, and only for upload media
          if (isHost && currentMedia && currentMedia.type === 'upload' && isConnected) {
            const currentTime = videoRef.current?.currentTime || 0;
            
            console.log('📤 [3D Cinema] HOST responding to state request with current playback:', {
              requester_id: msg.requester_id,
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
        case "playback_control":
          if (msg.sender_id && msg.sender_id === currentUser?.id) break;
          if (msg.file_path) {
            // 🎯 Latency compensation: adjust seek time for network delay
            const now = Date.now();
            const latency = now - (msg.timestamp || now); // Fallback to 0 if no timestamp
            const adjustedTime = (msg.seek_time || 0) + (latency / 1000);
            
            console.log('⏱️ [3D Cinema] Playback control received:', {
              command: msg.command,
              seek_time: msg.seek_time,
              latency_ms: latency,
              adjusted_time: adjustedTime,
              current_isPlaying: isPlaying,
              will_change_playState: msg.command === "play" || msg.command === "pause"
            });
            
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
            const fileUrl = msg.file_url || msg.file_path;
            const mediaUrl = fileUrl.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
            
            // 🎯 OPTIMIZATION: Skip setCurrentMedia if same media is already loaded (prevents unnecessary re-renders)
            const isSameMedia = currentMedia && 
                                currentMedia.ID === msg.media_item_id && 
                                currentMedia.mediaUrl === mediaUrl;
            
            if (isSameMedia && msg.command === "seek") {
              // ✅ Same media, just apply seek directly without triggering React re-render
              console.log('⏩ [3D Cinema] Same media - applying seek without re-render');
              if (videoRef.current) {
                const video = videoRef.current;
                const drift = video.currentTime - adjustedTime; // Positive = member ahead, negative = member behind
                const absDrift = Math.abs(drift);
                
                if (absDrift > 5.0) {
                  // 🚨 Large drift (>5s) - hard seek (rare, but necessary)
                  console.log(`🚨 [Sync] Large drift: ${drift.toFixed(2)}s - hard seeking to ${adjustedTime.toFixed(2)}s`);
                  video.currentTime = adjustedTime;
                  video.playbackRate = 1.0; // Reset to normal speed
                } else if (absDrift > 0.8) {
                  // 🎵 Medium drift (0.8-5s) - smooth correction via playback rate
                  // Catch up/slow down by adjusting speed (1-15% variation)
                  const correction = Math.min(drift * 0.08, 0.15); // Max 15% speed change
                  video.playbackRate = 1.0 - correction; // Behind = speed up, ahead = slow down
                  console.log(`🎵 [Sync] Smooth correction - drift: ${drift.toFixed(2)}s, playbackRate: ${video.playbackRate.toFixed(3)}x`);
                } else {
                  // ✅ Small drift (<0.8s) - in sync, normal speed
                  if (video.playbackRate !== 1.0) {
                    video.playbackRate = 1.0;
                    console.log(`✅ [Sync] In sync (drift: ${drift.toFixed(2)}s) - normal speed`);
                  }
                }
              }
              break; // Skip setCurrentMedia() to avoid re-render
            }
            
            // 🎯 Different media or play/pause command - update state
            console.log('🔄 [3D Cinema] New media or play/pause - updating state');
            loadStartTimeRef.current = Date.now(); // ⏱️ Track loading start for compensation
            setPendingSeekTime(adjustedTime);
            
            setCurrentMedia({
              ID: msg.media_item_id,
              type: 'upload',
              file_path: msg.file_path,
              mediaUrl: mediaUrl,
              original_name: msg.original_name || 'Unknown Media',
            });
            
            // 🎯 FIX: Only update play/pause for explicit play/pause commands, not seek-only
            if (msg.command === "play" || msg.command === "pause") {
              setIsPlaying(msg.command === "play");
              console.log(`🎬 [3D Cinema] ${msg.command === "play" ? "Playing" : "Pausing"} video from playback_control`);
            }
            // For "seek" commands, maintain current play state
          }
          break;
        case "screen_share_started":
          setCurrentMedia({ type: 'screen_share', title: 'Live Screen Share' });
          setIsPlaying(true);
          break;
        case "screen_share_stopped":
          setRemoteScreenTrack(null);
          setRemoteCameraTrack(null);
          setCurrentMedia(null);
          setIsPlaying(false);
          break;
        case 'reaction':
          if (msg.data.session_id === sessionStatus.id) {
            setSessionChatMessages(prev =>
              prev.map(m => {
                if (m.ID !== msg.data.message_id) return m;
                const alreadyReacted = (m.reactions || []).some(
                  r => r.user_id === msg.data.user_id && r.emoji === msg.data.emoji
                );
                if (alreadyReacted) return m;
                return { ...m, reactions: [...(m.reactions || []), msg.data] };
              })
            );
          }
          break;
        case 'seats_auto_assigned':
          // msg shape: { user_seats: {"7":"2-3"}, usernames: {"7":"chibi"}, avatar_urls: {"7":"https://..."} }
          const incomingUserSeats = msg.user_seats || (msg.data && msg.data.user_seats);
          const incomingUsernames = msg.usernames || (msg.data && msg.data.usernames);
          const incomingAvatarURLs = msg.avatar_urls || (msg.data && msg.data.avatar_urls);
          
          console.log('🪑 [SEATS_AUTO_ASSIGNED] Received:', {
            userSeats: incomingUserSeats,
            usernames: incomingUsernames,
            avatarURLs: incomingAvatarURLs
          });
          
          if (incomingUserSeats) {
            // ✅ MERGE instead of REPLACE to preserve existing seat assignments
            setUserSeats(prev => {
              const merged = { ...prev, ...incomingUserSeats };
              return merged;
            });
          }

          // If backend included a small username map for seated users, merge them into roomMembers so UI can label seats
          if (incomingUsernames && Object.keys(incomingUsernames).length) {
            setRoomMembers(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const additions = Object.keys(incomingUsernames).reduce((acc, uidStr) => {
                const idNum = parseInt(uidStr, 10);
                if (!existingIds.has(idNum)) {
                  const member = {
                    id: idNum,
                    username: incomingUsernames[uidStr],
                    avatar_url: incomingAvatarURLs?.[uidStr] || null,
                    user_role: 'viewer',
                    is_demo: false
                  };
                  console.log('➕ [SEATS_AUTO_ASSIGNED] Adding new member:', member);
                  acc.push(member);
                }
                return acc;
              }, []);
              
              // 🔊 Play join sound when new users are added (excluding self on initial load)
              if (additions.length > 0 && joinSoundRef.current && currentUser) {
                const isCurrentUserJoining = additions.some(a => a.id === currentUser.id);
                if (!isCurrentUserJoining) {
                  joinSoundRef.current.currentTime = 0;
                  joinSoundRef.current.play().catch(err => console.log('Join sound play error:', err));
                  console.log('🔊 Playing join sound for', additions.length, 'new user(s)');
                }
              }
              
              if (additions.length === 0) return prev;
              return [...prev, ...additions];
            });
          }
          break;
        case 'seat_update':
          if (msg.userId && msg.seat) {
            setUserSeats(prev => ({ ...prev, [msg.userId]: `${msg.seat.row}-${msg.seat.col}` }));
          }
          break;
        case 'session_status':
          // ✅ Confirm session membership (allows LiveKit connection)
          if (!isSessionMemberConfirmed) {
            console.log('✅ [SESSION_STATUS] Session membership confirmed - LiveKit can now connect');
            setIsSessionMemberConfirmed(true);
          }
          
          console.log('� [SESSION_STATUS] Received:', {
            memberCount: msg.data.member_count,
            membersArrayLength: msg.data.members?.length || 0,
            seatingKeys: Object.keys(msg.data.seating || {}),
            seatingData: msg.data.seating,
            seatingDataRaw: JSON.stringify(msg.data.seating),
            currentUserId: currentUser?.id,
            timestamp: new Date().toISOString()
          });
          console.log('🔍 [SESSION_STATUS] Members array:', msg.data.members?.map(m => `${m.username}(${m.user_id})`).join(', '));
          console.log('🔍 [SESSION_STATUS] First seating entry:', Object.entries(msg.data.seating || {})[0]);
          console.log('🔍 [SESSION_STATUS] componentId:', componentIdRef.current, 'roomMembers.length:', roomMembers.length);
          
          // ✅ LECTURE HALL PATTERN: Process members array immediately (no currentUser check)
          // Member visibility should work even before auth fully loads
          if (msg.data.members && Array.isArray(msg.data.members)) {
            console.log('👥 [SESSION_STATUS] Processing', msg.data.members.length, 'members:', 
              msg.data.members.map(m => `${m.username}(${m.user_id})`).join(', '));
            console.log('� [SESSION_STATUS] Members with avatar data:', msg.data.members.map(m => ({
              username: m.username,
              user_id: m.user_id,
              avatar_url: m.avatar_url,
              hasAvatar: !!m.avatar_url
            })));
            console.log('�👥 [SESSION_STATUS] About to call setRoomMembers, componentId:', componentIdRef.current);
            
            // Keep demo users, replace real users with fresh data from backend
            setRoomMembers(prev => {
              console.log('🔄 [SESSION_STATUS] setRoomMembers CALLBACK executing, componentId:', componentIdRef.current, 'prev.length:', prev.length);
              const demoUsers = prev.filter(u => u.is_demo);
              const freshMembers = msg.data.members.map(m => ({
                id: m.user_id || m.id,
                user_id: m.user_id || m.id,
                username: m.username,
                avatar_url: m.avatar_url,
                user_role: m.user_role || 'viewer',
                is_active: m.is_active
              }));
              
              console.log('🔍 [SESSION_STATUS] Mapped freshMembers with avatars:', freshMembers.map(m => ({
                username: m.username,
                avatar_url: m.avatar_url,
                hasAvatar: !!m.avatar_url
              })));
              
              const newMembers = [...demoUsers, ...freshMembers];
              console.log('✅ [SESSION_STATUS] setRoomMembers CALLBACK complete, componentId:', componentIdRef.current, 'demo=' + demoUsers.length + ', real=' + freshMembers.length + ', total=' + newMembers.length);
              console.log('✅ [SESSION_STATUS] New members:', newMembers.map(m => `${m.username}(${m.id})`).join(', '));
              
              return newMembers;
            });
          }
          
          // ✅ SEATING ASSIGNMENT: Process for ALL users (currentUser check not needed for seat data)
          // The seating data is a map of ALL users' seats, not just current user's seat
          if (msg.data.seating && typeof msg.data.seating === 'object') {
            console.log('🪑 [SESSION_STATUS] Processing seating:', msg.data.seating);
            console.log('🪑 [SESSION_STATUS] Seating data type check - first entry:', Object.entries(msg.data.seating)[0]);
            setUserSeats(prev => {
              const updated = { ...prev };
              // Backend sends {seatId: userId}, but we need {userId: seatId}
              Object.entries(msg.data.seating).forEach(([seatId, userId]) => {
                console.log(`  🔄 [SESSION_STATUS] Inverting: seat="${seatId}" → user="${userId}"`);
                updated[userId] = seatId; // SWAP: userId becomes key, seatId becomes value
              });
              console.log('✅ [SESSION_STATUS] Updated userSeats:', updated);
              return updated;
            });
          } else {
            console.log('⚠️ [SESSION_STATUS] No seating data in session_status (expected for new sessions)');
          }
          
          // ✅ OLD LOGIC REMOVED - replaced with simpler member sync above
          /* Legacy code that used seated_usernames filtering - replaced with direct members array sync
          setRoomMembers(prev => {
            console.log('👥 [CinemaScene3D] Updating roomMembers from session_status');
            console.log('  - Previous members:', prev.map(m => ({ id: m.id, username: m.username, is_demo: m.is_demo })));
            const demoUsers = prev.filter(u => u.is_demo);
            console.log('  - Demo users count:', demoUsers.length);
            const freshMembers = new Map();
            
            // ✅ Build set of active user IDs from seated_usernames (backend-filtered)
            const activeUserIDs = new Set();
            if (msg.data.seated_usernames && typeof msg.data.seated_usernames === 'object') {
              console.log('  - seated_usernames from backend:', msg.data.seated_usernames);
              Object.keys(msg.data.seated_usernames).forEach(userIdStr => {
                activeUserIDs.add(parseInt(userIdStr, 10));
              });
            } else if (msg.data.seating && typeof msg.data.seating === 'object') {
              // Fallback: Extract user IDs from seating object if seated_usernames is missing
              console.log('  - seated_usernames missing, extracting from seating:', msg.data.seating);
              Object.values(msg.data.seating).forEach(userId => {
                if (userId && typeof userId === 'number') {
                  activeUserIDs.add(userId);
                }
              });
            }
            // Always include current user
            if (currentUser) {
              activeUserIDs.add(currentUser.id);
            }
            console.log('  - Active user IDs:', Array.from(activeUserIDs));
            
            // console.log('🪑 [CinemaScene3D] Active user IDs from backend:', Array.from(activeUserIDs));
            
            // Add current user first
            if (currentUser) {
              freshMembers.set(currentUser.id, {
                id: currentUser.id,
                username: currentUser.username || `User${currentUser.id}`,
                user_role: 'viewer'
              });
            }
            
            // Add users from seated_usernames (active users only, filtered by backend)
            if (msg.data.seated_usernames && typeof msg.data.seated_usernames === 'object') {
              console.log('🪑 [CinemaScene3D] Received seated usernames from backend:', msg.data.seated_usernames);
              Object.entries(msg.data.seated_usernames).forEach(([userIdStr, username]) => {
                const userId = parseInt(userIdStr, 10);
                if (!freshMembers.has(userId)) {
                  freshMembers.set(userId, {
                    id: userId,
                    username: username,
                    user_role: 'viewer'
                  });
                  console.log(`🪑 [CinemaScene3D] Added seated user to roomMembers: ${username} (ID: ${userId})`);
                }
              });
            } else if (activeUserIDs.size > 0) {
              // Fallback: Create members from activeUserIDs with placeholder names
              console.log('🪑 [CinemaScene3D] seated_usernames missing, creating members from activeUserIDs');
              // Try to get usernames from members array if available
              const membersMap = new Map();
              if (msg.data.members && Array.isArray(msg.data.members)) {
                msg.data.members.forEach(member => {
                  membersMap.set(member.user_id, member.username);
                });
              }
              
              activeUserIDs.forEach(userId => {
                if (!freshMembers.has(userId)) {
                  const username = membersMap.get(userId) || `User${userId}`;
                  freshMembers.set(userId, {
                    id: userId,
                    username: username,
                    user_role: 'viewer'
                  });
          // ✅ OLD LOGIC REMOVED - replaced with simpler member sync above
          /* Legacy code that used seated_usernames filtering - replaced with direct members array sync */
          break;
          
        case 'user_audio_state':
          if (msg.userId === currentUser?.id) {
            setIsAudioActive(msg.isAudioActive);
          }
          // Track all users' audio states for MembersModal
          setRemoteAudioStates(prev => ({
            ...prev,
            [msg.userId]: msg.isAudioActive
          }));
          break;
        
        case 'broadcast_permission_changed':
          const { user_id: affectedUserId, can_broadcast } = msg;
          
          // Update broadcast permissions state
          setBroadcastPermissions(prev => ({
            ...prev,
            [affectedUserId]: can_broadcast
          }));
          
          // Show toast notification to affected user
          if (affectedUserId === currentUser?.id) {
            if (can_broadcast) {
              toast.success('🔊 You can now speak to the whole room!');
            } else {
              toast.info('🔈 You can now only speak to your row');
            }
          }
          break;
        case 'private_chat_message':
          // ✅ Only process if current user is the RECEIVER (not sender)
          // This prevents duplicates from WebSocket echo when we send messages
          if (msg.to_user_id === currentUser?.id) {
            const otherUserId = msg.from_user_id;
            setPrivateMessages(prev => ({
              ...prev,
              [otherUserId]: [...(prev[otherUserId] || []), msg]
            }));
            
            // ✅ Increment unread count if chat is not currently open with this user
            if (selectedUser?.id !== otherUserId) {
              setUnreadMessages(prev => ({
                ...prev,
                [otherUserId]: (prev[otherUserId] || 0) + 1
              }));
            }
          }
          break;

        case 'private_chat_history':
          const { other_user_id, messages: history } = msg.data;
          setPrivateMessages(prev => ({
            ...prev,
            [other_user_id]: history
          }));
          break;
        case 'participant_join':
          // ⚠️ Don't add to roomMembers here - participant_join fires when connecting to room WebSocket (RoomPage)
          // Members are only added when they join the session (via session_status or session_member_joined)
          console.log('👥 [CinemaScene3D] participant_join (WebSocket connection, NOT session join):', msg.data?.username);
          break;

        case 'session_member_joined':
          // ✅ EVENT-DRIVEN: Real-time member join from backend
          if (msg.data?.user_id && msg.data?.username) {
            const userId = msg.data.user_id;
            const username = msg.data.username;
            const userRole = msg.data.user_role || 'viewer';
            
            console.log(`👥 [MEMBER JOIN] ${username} (ID:${userId}) joined - Current room: ${roomMembers.length} members`);
            console.log('🔍 [MEMBER JOIN] Avatar data:', {
              username: username,
              avatar_url: msg.data.avatar_url,
              hasAvatar: !!msg.data.avatar_url,
              fullData: msg.data
            });
            
            setRoomMembers(prev => {
              const exists = prev.some(m => m.id === userId);
              if (exists) {
                console.log(`⚠️ [MEMBER JOIN] ${username} already in room, skipping duplicate`);
                return prev;
              }
              const newMembers = [...prev, {
                id: userId,
                username: username,
                avatar_url: msg.data.avatar_url,
                user_role: userRole
              }];
              console.log(`✅ [MEMBER JOIN] ${username} added → Room now has ${newMembers.length} members: ${newMembers.map(m => m.username).join(', ')}`);
              return newMembers;
            });
            
            // ✅ Request updated seat state when seeing another member join
            // The new member should have already sent request_seat, so backend will assign them
            if (userId !== currentUser?.id) {
              console.log(`🪑 [SEAT SYNC] ${username} joined, requesting updated seat assignments`);
              setTimeout(() => {
                if (sendMessage) {
                  sendMessage({ 
                    type: 'request_seat_state',
                    session_id: finalSessionId
                  });
                }
              }, 300); // Delay to allow backend to process member's request_seat
            } else {
              console.log(`🎭 [SELF JOIN] I (${username}) joined the room`);
            }
          }
          break;

        case 'participant_leave':
          // ⚠️ Don't remove from roomMembers here - participant_leave fires when disconnecting from room WebSocket
          // Members are only removed when they leave the session (via session_member_left event)
          console.log('👋 [CinemaScene3D] participant_leave (WebSocket disconnect, NOT session leave):', msg.data?.userId);
          break;

        case 'session_member_left':
          // ✅ EVENT-DRIVEN: Real-time member leave from backend
          console.log('👋 [CinemaScene3D] Received session_member_left:', msg.data);
          if (msg.data?.user_id) {
            const userId = msg.data.user_id;
            const username = msg.data.username;
            
            console.log('👋 [CinemaScene3D] Removing member:', username, userId);
            setRoomMembers(prev => {
              const updated = prev.filter(m => m.id !== userId);
              console.log('👋 [CinemaScene3D] Updated roomMembers:', {
                before: prev.length,
                after: updated.length,
                removedUser: username
              });
              return updated;
            });
            
            // Remove their seat assignment
            setUserSeats(prev => {
              const updated = { ...prev };
              delete updated[userId];
              console.log('🪑 [CinemaScene3D] Removed seat for user:', userId);
              return updated;
            });
          }
          break;

        case 'user_left_seat':
          // Real-time seat cleanup when user explicitly leaves their seat
          if (msg.data?.user_id) {
            console.log('🪑 [CinemaScene3D] User left seat:', msg.data.user_id);
            setUserSeats(prev => {
              const updated = { ...prev };
              delete updated[msg.data.user_id];
              return updated;
            });
          }
          break;
        
        case 'user_left':
          // ✅ Handle WebSocket disconnect cleanup - remove from member list
          if (msg.data?.user_id || msg.data?.userId) {
            const leftUserId = msg.data.user_id || msg.data.userId;
            const leftUsername = msg.data.username || `User ${leftUserId}`;
            console.log('👋 [CinemaScene3D] User left (disconnect):', leftUsername, leftUserId);
            
            setRoomMembers(prev => {
              const updated = prev.filter(m => m.id !== leftUserId);
              console.log('👋 [CinemaScene3D] Updated member count:', prev.length, '→', updated.length);
              return updated;
            });
            
            // Remove their seat assignment
            setUserSeats(prev => {
              const updated = { ...prev };
              delete updated[leftUserId];
              console.log('🪑 [CinemaScene3D] Removed seat for user:', leftUserId);
              return updated;
            });
          }
          break;
        
        case 'seat_state_refresh':
          // Periodic seat state refresh from backend
          console.log('🔄 [CinemaScene3D] Received seat_state_refresh:', msg.data);
          console.log('🔄 [CinemaScene3D] Current roomMembers before refresh:', roomMembers.length);
          
          // Update seating assignments
          if (msg.data.seating && typeof msg.data.seating === 'object') {
            setUserSeats(prev => {
              const updated = { ...prev }; // Preserve existing seats (including demo users)
              
              // Update with real users from backend
              // Convert backend format { "5-0": 7 } to { 7: "5-0" }
              Object.entries(msg.data.seating).forEach(([seatId, userId]) => {
                updated[userId] = seatId;
              });
              
              console.log('🔄 [CinemaScene3D] Refreshed userSeats:', updated);
              return updated;
            });
          }
          
          // Update roomMembers - merge with existing members (don't remove unseated ones)
          if (msg.data.seated_usernames && typeof msg.data.seated_usernames === 'object') {
            const avatarURLsFromRefresh = msg.data.avatar_urls || {};
            console.log('🔄 [CinemaScene3D] Avatar URLs in seat_state_refresh:', avatarURLsFromRefresh);
            
            setRoomMembers(prev => {
              const memberMap = new Map();
              
              // ✅ PRESERVE ALL EXISTING MEMBERS (including unseated ones)
              prev.forEach(member => {
                memberMap.set(member.id, member);
              });
              
              // ✅ ADD/UPDATE SEATED USERS from backend
              Object.entries(msg.data.seated_usernames).forEach(([userIdStr, username]) => {
                const userId = parseInt(userIdStr, 10);
                const avatarURL = avatarURLsFromRefresh[userIdStr] || memberMap.get(userId)?.avatar_url || null;
                
                memberMap.set(userId, {
                  id: userId,
                  username: username,
                  avatar_url: avatarURL,
                  user_role: memberMap.get(userId)?.user_role || 'viewer',
                  is_demo: memberMap.get(userId)?.is_demo || false
                });
              });
              
              const finalMembers = Array.from(memberMap.values());
              console.log('🔄 [CinemaScene3D] Refreshed roomMembers:', {
                before: prev.length,
                after: finalMembers.length,
                members: finalMembers.map(m => ({ id: m.id, username: m.username, avatar_url: m.avatar_url, is_demo: m.is_demo }))
              });
              return finalMembers;
            });
          }
          break;
        
        case 'session_ended':
          // Session ended - either manually by host or auto-ended after grace period
          console.log('🔚 [CinemaScene3D] Session ended:', msg.data);
          
          // ✅ Clear podcast title styles from localStorage
          try {
            const storageKey = `podcast_title_style_${sessionId}`;
            localStorage.removeItem(storageKey);
            console.log('🗑️ Cleared podcast title styles from localStorage');
          } catch (err) {
            console.warn('Failed to clear podcast title styles:', err);
          }
          
          // ✅ Clear private messages and unread counts
          setPrivateMessages({});
          setUnreadMessages({});
          
          // Clear ticket cache for this session
          if (finalSessionId) {
            clearTicketCache(msg.data?.session_id || finalSessionId);
            console.log('🗑️ [CinemaScene3D] Cleared ticket cache for ended session');
          }
          
          // ✅ Store session data for rating modal (if not the host)
          const isCurrentUserHost = currentUser?.id === msg.data?.host_id;
          if (!isCurrentUserHost && msg.data?.session_id) {
            console.log('⭐ [CinemaScene3D] Storing session data for rating modal');
            sessionStorage.setItem(`pending_rating_${roomId}`, JSON.stringify({
              sessionId: msg.data.session_id,
              hostId: msg.data.host_id,
              hostName: msg.data.host_name || 'Unknown Host',
              sessionTitle: msg.data.session_title || 'Untitled Session',
              watchType: msg.data.watch_type,
            }));
          }
          
          // Show toast notification
          const reason = msg.data?.reason;
          if (reason === 'host_timeout') {
            toast('Session ended - Host disconnected for over 10 minutes', {
              icon: '⏰',
              duration: 5000,
            });
          } else {
            toast('3D Cinema session ended', {
              icon: 'ℹ️',
              duration: 3000,
            });
          }
          
          // Navigate back to room page after a brief delay
          setTimeout(() => {
            handleLeaveCall();
          }, 2000);
          break;
        
        case 'audio_mode_changed':
          // Host changed audio mode - update all users
          if (msg.mode && (msg.mode === 'seat' || msg.mode === 'party')) {
            console.log(`🎤 [Cinema] Audio mode changed to: ${msg.mode} (by host ${msg.host_id})`);
            setAudioMode(msg.mode);
            
            // Persist to sessionStorage
            sessionStorage.setItem(`cinema_audio_mode_${roomId}`, msg.mode);
            
            // Show toast notification
            const modeText = msg.mode === 'seat' ? 'Seat Mode' : 'Party Mode';
            const modeDescription = msg.mode === 'seat' 
              ? 'You can now hear users in your row only' 
              : 'Everyone can hear everyone';
            
            toast(`Audio mode: ${modeText}`, {
              icon: msg.mode === 'seat' ? '🎭' : '🎉',
              description: modeDescription,
              duration: 3000,
            });
          }
          break;
        
        case 'ticket_required':
          // Backend rejected connection - no ticket for paid session
          console.log('❌ [CinemaScene3D] Ticket required:', msg.data);
          toast.error('This is a paid session. Please purchase a ticket.');
          setTimeout(() => {
            navigate(`/rooms/${roomId}?openTicketModal=true`);
          }, 1000);
          break;
        
        // 🎮 Handle game_started
        case 'game_started':
          console.log('🎮 [CinemaScene3D] Game started:', msg.data);
          setActiveGame(msg.data);
          toast.success(`${msg.data.game_type.replace('_', ' ').toUpperCase()} started!`, {
            duration: 3000,
            icon: '🎮'
          });
          break;

        // 🎮 Handle game_state_update
        case 'game_state_update':
          console.log('🎮 [CinemaScene3D] Game state updated:', msg);
          // Backend sends data at root level
          if (msg.game_state) {
            setActiveGame(prev => prev ? {
              ...prev,
              game_state: msg.game_state, // ✅ Use snake_case to match GameScreenRenderer
              currentTurn: msg.current_turn
            } : null);
          }
          break;

        // 🎮 Handle game_ended
        case 'game_ended':
          console.log('🎮 [CinemaScene3D] Game ended:', msg.data);
          // ✅ Don't clear game immediately - keep it displayed to show results
          // User can see winner, picks, and click "Play Again" button
          // Game will be cleared when user restarts or manually closes
          break;

        // 🎮 Handle game_forfeited
        case 'game_forfeited':
          console.log('🎮 [CinemaScene3D] Game forfeited:', msg.data);
          toast.info(`${msg.data.username} forfeited. ${msg.data.winner_username} wins!`, {
            duration: 4000,
            icon: '🏆'
          });
          setActiveGame(null);
          break;

        // 🎮 Handle game_error
        case 'game_error':
          console.error('❌ [CinemaScene3D] Game error:', msg.data);
          toast.error(msg.data.message || 'Game error occurred');
          break;
        
        default:
          break;
      }
    });
    processedMessageCountRef.current = messages.length;
  }, [messages, sessionStatus?.id, currentUser?.id, handleSeatSwapMessage]); // ✅ add hook to deps
  
  // 🎮 GAME SYSTEM: Handler Functions
  const handleGameClick = useCallback(() => {
    console.log('🎮 [handleGameClick] Button clicked! isHost:', isHost);
    if (isHost) {
      console.log('🎮 [handleGameClick] Opening game lobby...');
      setIsGameLobbyOpen(true);
    } else {
      console.log('🎮 [handleGameClick] Not host, showing toast');
      toast('Only the host can start games', { icon: 'ℹ️' });
    }
  }, [isHost]);

  const handleStartGame = useCallback((gameType, playersData) => {
    console.log('🎮 [handleStartGame] Called with:', { gameType, playersData });
    console.log('🎮 [handleStartGame] Full player data:', JSON.stringify(playersData, null, 2));
    
    if (!sendMessage) {
      console.error('❌ [CinemaScene3D] sendMessage not available');
      return;
    }
    
    const message = {
      type: 'start_game',
      data: {
        game_type: gameType,
        players: playersData
      }
    };
    
    console.log('🎮 [handleStartGame] Sending WebSocket message:', JSON.stringify(message, null, 2));
    sendMessage(message);
    
    console.log('🎮 [handleStartGame] Message sent, closing lobby');
    setIsGameLobbyOpen(false);
  }, [sendMessage]);

  const handleGameMove = useCallback((moveData) => {
    if (!sendMessage) {
      console.error('❌ [CinemaScene3D] sendMessage not available');
      return;
    }
    
    // Check if this is a restart action
    if (moveData.action === 'restart_game') {
      console.log('🎮 [CinemaScene3D] Restarting game');
      const game = activeGame || currentGame;
      if (game && game.game_type) {
        // Restart the same game with the same players
        console.log('🎮 [CinemaScene3D] Sending start_game:', {
          game_type: game.game_type,
          players: game.players
        });
        sendMessage({
          type: 'start_game',
          data: {
            game_type: game.game_type,
            players: game.players
          }
        });
        // Clear the game states so new game can replace it
        setActiveGame(null);
        setCurrentGame(null);
      } else {
        console.error('❌ [CinemaScene3D] Cannot restart - missing game data:', game);
      }
      return;
    }
    
    // Get active game session ID
    const game = activeGame || currentGame;
    if (!game || !game.sessionId) {
      console.error('❌ [CinemaScene3D] No active game session');
      return;
    }
    
    console.log('🎮 [CinemaScene3D] Making move:', { move_type: 'pick', move_data: moveData, game_session_id: game.sessionId });
    
    sendMessage({
      type: 'make_move',
      data: {
        game_session_id: game.sessionId,
        move_type: 'pick',
        move_data: moveData
      }
    });
  }, [sendMessage, activeGame, currentGame, setActiveGame, setCurrentGame]);

  const handleGameClose = useCallback(() => {
    console.log('🎮 [CinemaScene3D] Closing game');
    setActiveGame(null);
    setCurrentGame(null);
  }, []);

  // 🎮 Update game canvas when activeGame OR currentGame changes
  useEffect(() => {
    const game = activeGame || currentGame;
    console.log('🎮 [Game Canvas Effect] Game state changed:', {
      hasGame: !!game,
      gameType: game?.game_type,
      hasRenderer: !!gameCanvasRendererRef.current,
      activeGame,
      currentGame
    });
    
    if (game && gameCanvasRendererRef.current) {
      const canvas = gameCanvasRendererRef.current.getCanvas();
      console.log('🎮 [Game Canvas Effect] Got canvas from renderer:', canvas);
      setGameCanvas(canvas);
    } else {
      console.log('🎮 [Game Canvas Effect] Clearing game canvas');
      setGameCanvas(null);
    }
  }, [activeGame, currentGame]);
  
  // === Handlers ===
  const handleSendSessionMessage = () => {
    if (!newSessionMessage.trim() || !sessionStatus?.id || !sendMessage) return;
    sendMessage({
      type: 'chat_message',
      data: {
        message: newSessionMessage.trim(),
        session_id: sessionStatus.id,
        user_id: currentUser?.id,
        username: currentUser?.username || `User${currentUser?.id}`
      }
    });
    setNewSessionMessage('');
  };

  const handleReactToMessage = (messageId, emoji) => {
    if (!sessionStatus?.id || !sendMessage) return;
    sendMessage({
      type: 'reaction',
      data: {
        message_id: messageId,
        emoji,
        user_id: currentUser?.id,
        session_id: sessionStatus.id,
        timestamp: Date.now()
      }
    });
  };

  const handleLeaveCall = async () => {
    // 🔄 RECALCULATE isHost with CURRENT values (avoid stale closure)
    const currentIsHostFromSession = currentUser?.id === sessionStatus?.hostId;
    const currentIsHostFromMembers = currentUser?.id === roomMembers.find(m => m.user_role === 'host')?.id;
    const currentIsHostFromRestApi = currentUser?.id === restApiSession?.host_id; // 📡 Fallback to REST API
    const currentIsHost = isHostFromState || currentIsHostFromSession || currentIsHostFromRestApi || currentIsHostFromMembers;  // ✅ Use || for boolean OR
    
    console.log('🚪🚪🚪 [CinemaScene3D] ===== handleLeaveCall CALLED =====');
    console.log('🔍 [CinemaScene3D] isHost (OLD captured):', isHost);
    console.log('🔍 [CinemaScene3D] currentIsHost (FRESH):', currentIsHost);
    console.log('🔍 [CinemaScene3D] Host detection sources:', {
      isHostFromState,
      currentIsHostFromSession,
      currentIsHostFromRestApi,
      currentIsHostFromMembers,
      restApiHostId: restApiSession?.host_id,
      sessionStatusHostId: sessionStatus?.hostId,
      currentUserId: currentUser?.id
    });
    console.log('🔍 [CinemaScene3D] finalSessionId:', finalSessionId);
    // console.log('🔍 [CinemaScene3D] roomId:', roomId);
    // console.log('🔍 [CinemaScene3D] currentUser:', currentUser);
    
    // ✅ HOST: Show confirmation and end session for everyone
    if (currentIsHost) {
      // console.log('✅ [CinemaScene3D] User IS host - showing confirmation dialog...');
      const confirmed = window.confirm(
        "End this 3D Cinema session for everyone? All participants will be returned to the lobby."
      );
      
      // console.log('🔍 [CinemaScene3D] User confirmation result:', confirmed);
      
      if (!confirmed) {
        // console.log('❌ [CinemaScene3D] Host cancelled leave - staying in session');
        return; // Host cancelled, stay in session
      }
      
      // Host confirmed - end the session
      // console.log('✅ [CinemaScene3D] Host confirmed - proceeding to end session');
      try {
        if (finalSessionId) {
          // console.log('🛑 [CinemaScene3D] Calling end API for session:', finalSessionId);
          // console.log('🛑 [CinemaScene3D] API URL:', `/api/rooms/${roomId}/sessions/${finalSessionId}/end`);
          await apiClient.post(`/api/rooms/${roomId}/sessions/${finalSessionId}/end`);
          // console.log('✅✅✅ [CinemaScene3D] End API call succeeded!');
          
          // ✅ Set flag to prevent showing stale session UI on RoomPage
          sessionStorage.setItem(`session_ended_${roomId}`, 'true');
          console.log(`🏷️ [CinemaScene3D] Set session_ended flag for room ${roomId}`);
          
          // Small delay to ensure backend broadcasts before navigation
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error('❌ [CinemaScene3D] Failed to end session:', error);
        // Continue with cleanup even if API call fails
      }
    } else {
      // ✅ Non-host: Just leaving (not ending session)
      console.log('👋 [CinemaScene3D] Non-host leaving session (session continues)');
    }
    
    try {
      // 1. Unpublish audio track if active
      if (isAudioActive && publishedAudioTrackRef.current && localParticipant) {
        console.log('🎤 [CinemaScene3D] Unpublishing audio track...');
        await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
        if (typeof publishedAudioTrackRef.current.stop === 'function') {
          publishedAudioTrackRef.current.stop();
        }
        publishedAudioTrackRef.current = null;
        setIsAudioActive(false);
      }
      
      // 2. Disconnect from LiveKit
      if (disconnectLiveKit) {
        console.log('🔌 [CinemaScene3D] Disconnecting from LiveKit...');
        await disconnectLiveKit();
      }
      
      // 3. Notify backend to clear seat assignment
      if (sendMessage && currentUser) {
        console.log('🪑 [CinemaScene3D] Notifying backend of seat departure...');
        sendMessage({
          type: 'leave_seat',
          user_id: currentUser.id
        });
      }
      
      console.log('✅ [CinemaScene3D] Cleanup complete, navigating away...');
    } catch (error) {
      console.error('❌ [CinemaScene3D] Error during leave call:', error);
    }
    
    // 4. Force navigation: if this was an instant watch, go back to lobby; otherwise go to room page
    try {
      console.log('🔍 [CinemaScene3D] Current URL:', window.location.href);
      const urlParams = new URLSearchParams(window.location.search);
      const instantParam = urlParams.get('instant');
      console.log('🔍 [CinemaScene3D] instant param from URL:', instantParam);
      
      if (instantParam === 'true') {
        console.log('✅ [CinemaScene3D] Instant watch detected - navigating to Lobby...');
        window.location.href = `/lobby`;
      } else {
        console.log('✅ [CinemaScene3D] Regular room - navigating to RoomPage...');
        window.location.href = `/rooms/${roomId}`;
      }
    } catch (err) {
      console.error('⚠️ [CinemaScene3D] Error checking instant param:', err);
      console.log('🏠 [CinemaScene3D] Navigating to RoomPage (fallback)...');
      window.location.href = `/rooms/${roomId}`;
    }
  };

  // 🎤 Ref to track published audio track
  // (moved to useCinemaAudio hook above)
  // const publishedAudioTrackRef = useRef(null);

  // ❌ OLD toggleAudio function - REPLACED by useCinemaAudio hook
  // const toggleAudio = async () => { ... }
  // Now using: cinemaToggleAudio() from useCinemaAudio hook + LiveKit publishing via useEffect

  // 🎤 Handle audio device change
  const handleAudioDeviceChange = async (deviceId) => {
    console.log('🎤 [CinemaScene3D] Changing audio device to:', deviceId);
    setSelectedAudioDeviceId(deviceId);

    // If currently active, republish with new device
    if (isAudioActive && localParticipant && publishedAudioTrackRef.current) {
      try {
        // Unpublish current track
        await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
        if (typeof publishedAudioTrackRef.current.stop === 'function') {
          publishedAudioTrackRef.current.stop();
        }
        publishedAudioTrackRef.current = null;

        // Publish with new device
        const constraints = {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        const audioTrack = stream.getAudioTracks()[0];
        await localParticipant.publishTrack(audioTrack);
        publishedAudioTrackRef.current = audioTrack;
        console.log('✅ [CinemaScene3D] Switched to new audio device:', audioTrack.label);
      } catch (err) {
        console.error('❌ [CinemaScene3D] Failed to switch audio device:', err);
      }
    }
  };

  // 🔊 Toggle broadcast permission for a user (host only)
  const handleToggleBroadcast = (userId, currentState) => {
    if (!isHost) return; // Only host can toggle
    
    const messageType = currentState ? 'revoke_broadcast' : 'grant_broadcast';
    
    sendMessage({
      type: messageType,
      session_id: sessionId,
      user_id: userId
    });
  };

  // 🎤 Request broadcast permission (non-host users)
  const handleRequestBroadcast = () => {
    if (isHost) return; // Host doesn't need to request
    
    sendMessage({
      type: 'request_broadcast',
      session_id: sessionId,
      user_id: currentUser?.id
    });
    
    toast.success('Broadcast request sent to host', {
      duration: 3000,
      icon: '🎤',
    });
  };

  const openMembers = () => {
    setIsMembersModalOpen(true);
  };

  const openTheaterOverview = () => {
    setIsTheaterOverviewOpen(true);
  };

  // 🎭 Fetch theaters for the session
  const fetchTheaters = async () => {
    if (!sessionStatus?.id) return;
    
    try {
      const response = await apiClient.get(`/api/sessions/${sessionStatus.id}/theaters`);
      setTheaters(response.data || []);
    } catch (error) {
      // Silently handle - theaters API may not exist yet
      if (error.response?.status !== 400 && error.response?.status !== 404) {
        console.error('Failed to fetch theaters:', error);
      }
    }
  };

  const handleSeatSelect = (seatId) => {
    if (!currentUser || !sendMessage) return;

    console.log('🪑 [CinemaScene3D] handleSeatSelect called:', {
      seatId,
      userId: currentUser.id,
      currentSeats: userSeats
    });

    const occupantId = Object.keys(userSeats).find(userId => userSeats[userId] === seatId);
    const isOccupied = !!occupantId;
    const isMe = occupantId === String(currentUser.id);

    console.log('🪑 [CinemaScene3D] Seat analysis:', {
      occupantId,
      isOccupied,
      isMe
    });

    if (isMe) {
      console.log('🪑 [CinemaScene3D] Already in this seat, closing modal');
      setIsSeatGridModalOpen(false);
      setOutgoingSwapRequest(null);
      return;
    }

    if (isOccupied) {
      console.log('🪑 [CinemaScene3D] Seat occupied, initiating swap request');
      const [row, col] = seatId.split('-').map(Number);
      setOutgoingSwapRequest({ targetUserId: occupantId, targetSeatId: seatId });
      sendMessage({
        type: 'seat_swap_request',
        requester_id: currentUser.id,
        target_user_id: parseInt(occupantId),
        target_seat: { row, col },
        requester_name: currentUser.username,
      });
      // ✅ Keep modal open — do NOT close
      return;
    } else {
      // Empty seat → take it AND close
      console.log('🪑 [CinemaScene3D] Taking empty seat:', seatId);
      jumpToSeat(seatId);
      setUserSeats(prev => {
        const updated = { ...prev, [currentUser.id]: seatId };
        console.log('🪑 [CinemaScene3D] Locally updated seats:', updated);
        return updated;
      });
      sendMessage({
        type: 'take_seat',
        seat_id: seatId,
        row: parseInt(seatId.split('-')[0]),
        col: parseInt(seatId.split('-')[1]),
        user_id: currentUser.id
      });
      console.log('📡 [CinemaScene3D] Sent take_seat message to backend');
      setIsSeatGridModalOpen(false); // ✅ Close only for empty seats
      setOutgoingSwapRequest(null);
    }
  };

  // 📱 Touch control handlers for mobile view
  const handleTouchLookLeft = useCallback(() => {
    if (cinemaSceneRef.current?.triggerViewPreset) {
      cinemaSceneRef.current.triggerViewPreset('lookLeft');
      showTaskbar(); // Show taskbar on interaction
    }
  }, [showTaskbar]);

  const handleTouchLookRight = useCallback(() => {
    if (cinemaSceneRef.current?.triggerViewPreset) {
      cinemaSceneRef.current.triggerViewPreset('lookRight');
      showTaskbar(); // Show taskbar on interaction
    }
  }, [showTaskbar]);

  const handleTutorialComplete = useCallback(() => {
    setShowTutorial(false);
  }, []);

  // Convert remoteParticipants array to Map for O(1) lookup + add audio levels
  const remoteParticipantsMap = React.useMemo(() => {
    const map = new Map();
    remoteParticipants.forEach(participant => {
      // Get audio level data for this participant
      const audioData = activeSpeakers.get(participant.identity) || { isSpeaking: false, audioLevel: 0 };
      
      map.set(participant.identity, {
        ...participant,
        isSpeaking: audioData.isSpeaking,
        audioLevel: audioData.audioLevel
      });
    });
    return map;
  }, [remoteParticipants, activeSpeakers]);

  // 🎤 Compute audioStates for MembersModal from activeSpeakers + local audio
  const audioStates = React.useMemo(() => {
    const states = {};
    
    // Add current user's local audio state
    if (currentUser?.id) {
      // Check if local participant is in activeSpeakers (includes own voice)
      const localIdentity = `user-${currentUser.id}`;
      const localAudioData = activeSpeakers.get(localIdentity);
      
      states[currentUser.id] = {
        isSpeaking: cinemaAudioActive && (localAudioData?.isSpeaking || false),
        audioLevel: cinemaAudioActive ? (localAudioData?.audioLevel || 0) : 0,
        isMuted: !cinemaAudioActive
      };
    }
    
    // Add remote participants' audio states from activeSpeakers
    remoteParticipants.forEach(participant => {
      // Extract user ID from LiveKit identity (format: "user-{id}" or "user-{id}-{tabId}")
      const match = participant.identity.match(/^user-(\d+)/);
      if (match) {
        const userId = parseInt(match[1]);
        const audioData = activeSpeakers.get(participant.identity) || { isSpeaking: false, audioLevel: 0 };
        
        states[userId] = {
          isSpeaking: audioData.isSpeaking,
          audioLevel: audioData.audioLevel,
          isMuted: !audioData.isSpeaking && audioData.audioLevel === 0 // Muted if not speaking and no audio
        };
      }
    });
    
    return states;
  }, [currentUser, cinemaAudioActive, remoteParticipants, activeSpeakers]);

  // === Render ===
  if (authLoading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  // 📹 Complete LiveShare handler (screen, camera, or both)
  const handleStartLiveShare = async (mode = 'screen', source = 'liveshare', config = null) => {
    if (!isLiveKitConnected || !localParticipant) {
      toast.error('LiveKit not connected. Please wait...');
      console.error('❌ [LiveShare] Cannot start - LiveKit not ready', {
        isConnected: isLiveKitConnected,
        hasParticipant: !!localParticipant
      });
      return;
    }
    
    try {
      console.log(`🎥 [LiveShare] Starting mode: ${mode}, source: ${source}`, config);
      
      let screenStream = null;
      let cameraStream = null;
      
      // Start screen share
      if (mode === 'screen' || mode === 'both') {
        console.log('🖥️ [LiveShare] Starting screen share...');
        await localParticipant.setScreenShareEnabled(true, {
          audio: true,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
          simulcast: false,
          // 🎯 Optimized encoding for screen sharing
          videoBitrate: 4500000, // 4.5 Mbps for crisp screen details
          videoCodec: 'vp8' // Better balance of quality and latency for screen content
        });
        
        // ✅ Get track publication immediately (NO POLLING)
        const screenTrackPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (screenTrackPub && screenTrackPub.track) {
          screenStream = new MediaStream([screenTrackPub.track.mediaStreamTrack]);
          screenShareTrackRef.current = screenTrackPub.track;
          setScreenShareTrackSid(screenTrackPub.trackSid);
          setLocalScreenTrack(screenTrackPub);
          console.log('✅ [LiveShare] Screen track acquired:', screenTrackPub.trackSid);
          
          // 🔊 CRITICAL: Check if screen share has audio track and publish it separately
          const screenShareAudioPub = localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
          if (screenShareAudioPub && screenShareAudioPub.track) {
            console.log('🔊 [LiveShare] Screen share audio track auto-published:', screenShareAudioPub.trackSid);
            screenStream.addTrack(screenShareAudioPub.track.mediaStreamTrack);
          } else {
            console.warn('⚠️ [LiveShare] No screen share audio track found - tab audio may not be shared');
          }
          
          // ✅ CREATE FRESH VIDEO ELEMENT for screen share (like PositionCalculatorPage)
          const screenVideo = document.createElement('video');
          screenVideo.srcObject = screenStream;
          screenVideo.autoplay = true;
          screenVideo.playsInline = true;
          screenVideo.muted = false; // Don't mute screen share (may have tab audio)
          screenVideo.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
          document.body.appendChild(screenVideo);
          
          // Store in LiveShare ref so 3D scene can use it
          liveShareVideoRef.current = screenVideo;
          
          // Add timeupdate listener for 3D sync
          const updateTime = () => {
            setCurrentTime(screenVideo.currentTime);
            if (videoTextureUpdateRef.current) {
              videoTextureUpdateRef.current();
            }
          };
          screenVideo.addEventListener('timeupdate', updateTime);
          
          screenVideo.play().catch(e => console.warn('⚠️ [LiveShare] Screen play failed:', e));
          
          console.log('✅ [LiveShare] Fresh screen video element created');
        } else {
          throw new Error('Screen share track not available');
        }
      }
      
      // Start camera share
      if (mode === 'camera' || mode === 'both') {
        console.log('📹 [LiveShare] Starting camera...');
        
        // Stop existing camera track if present
        if (cameraShareTrackRef.current) {
          console.log('🧹 [LiveShare] Cleaning up existing camera track');
          try {
            await localParticipant.unpublishTrack(cameraShareTrackRef.current);
            cameraShareTrackRef.current.stop();
          } catch (cleanupErr) {
            console.warn('⚠️ [LiveShare] Camera cleanup warning:', cleanupErr);
          }
          cameraShareTrackRef.current = null;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Get camera stream
        let stream = cameraStream;
        if (!stream) {
          console.log('📹 [LiveShare] Requesting camera access...');
          const cameraDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = cameraDevices.filter(d => d.kind === 'videoinput');
          
          if (videoDevices.length === 0) {
            toast.error('No camera devices found');
            if (mode === 'camera') return;
          } else {
            // Use first available camera
            const device = videoDevices[0];
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: device.deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
              },
              audio: false
            });
            setCameraStream(stream);
            
            // ✅ DON'T attach stream yet - wait until after LiveKit publishing
            console.log('✅ [LiveShare] Camera stream acquired (will attach after publishing)');
          }
        }
        
        if (stream) {
          // Create LocalVideoTrack and publish
          const videoTrack = stream.getVideoTracks()[0];
          const localVideoTrack = new LocalVideoTrack(videoTrack);
          
          // ✅ publishTrack returns publication synchronously
          const cameraPublication = await localParticipant.publishTrack(localVideoTrack, {
            source: Track.Source.Camera,
            name: 'camera-share',
            simulcast: false,
            // 🎯 Optimized encoding for camera/face video
            videoEncoding: {
              maxBitrate: 2500000, // 2.5 Mbps - sufficient for face video
              maxFramerate: 30
            }
          });
          
          console.log('✅ [LiveShare] Camera track published:', cameraPublication.trackSid);
          setCameraShareTrackSid(cameraPublication.trackSid);
          
          // ✅ CRITICAL: Create MediaStream from LiveKit track to prevent freezing
          cameraStream = new MediaStream([localVideoTrack.mediaStreamTrack]);
          cameraShareTrackRef.current = localVideoTrack;
          
          // ✅ CREATE FRESH VIDEO ELEMENTS (like PositionCalculator BlackboardWithMedia)
          // DO NOT reuse existing video elements - they have autoplay already fired
          if (mode === 'camera') {
            // Create new video element for camera (will display on main screen via cameraVideoElement prop)
            const video = document.createElement('video');
            video.srcObject = cameraStream;
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;
            video.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
            document.body.appendChild(video);
            
            // ✅ FIX: Store in liveShareCameraVideoRef (not liveShareVideoRef) 
            // because CinemaTheaterGLB expects cameraVideoElement for camera-only mode
            liveShareCameraVideoRef.current = video;
            
            video.play()
              .then(() => {
                console.log('✅ [LiveShare] Camera video playing - triggering canvas compositor');
                setCameraVideoReady(true); // 🎨 Trigger canvas compositor for podcast overlays
              })
              .catch(err => {
                console.warn('⚠️ [LiveShare] Play failed:', err.message);
              });
            
            console.log('✅ [LiveShare] Fresh video element created for CAMERA (main screen)');
          } else if (mode === 'both') {
            // Create new video element for PIP
            const video = document.createElement('video');
            video.srcObject = cameraStream;
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;
            video.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
            document.body.appendChild(video);
            
            // Replace the existing cameraVideoRef with fresh element
            if (cameraVideoRef.current && cameraVideoRef.current !== video) {
              // Store LiveShare camera video separately
              liveShareCameraVideoRef.current = video;
            } else {
              cameraVideoRef.current = video;
            }
            
            video.play()
              .then(() => {
                console.log('✅ [LiveShare] Camera video (both mode) playing - triggering canvas compositor');
                setCameraVideoReady(true); // 🎨 Trigger canvas compositor for podcast overlays
              })
              .catch(e => console.warn('⚠️ [LiveShare] PIP play failed:', e));
            
            console.log('✅ [LiveShare] Fresh video element created for PIP');
          }
        }
      }
      
      setLiveShareMode(mode);
      setSharingSource(source);
      
      // Determine title based on podcast config or mode
      const mediaTitle = config?.title ? config.title : `LiveShare (${mode})`;
      
      // ✅ Include streams and podcast config in currentMedia
      setCurrentMedia({ 
        type: 'liveshare', 
        title: mediaTitle,
        stream: screenStream,      // Screen share MediaStream
        cameraStream: cameraStream, // Camera MediaStream
        podcastConfig: config       // Podcast metadata for overlay
      });
      setIsPlaying(true);
      
      sendMessage({
        type: "update_room_status",
        data: {
          is_screen_sharing: true,
          screen_sharing_user_id: currentUser.id,
          currently_playing: `LiveShare (${mode})`,
          liveshare_mode: mode
        }
      });
      
      toast.success(`LiveShare started: ${mode}`);
    } catch (err) {
      console.error('❌ [LiveShare] Error:', err);
      toast.error(`Failed to start ${mode} share`);
      
      // Cleanup on error
      if (localParticipant) {
        await localParticipant.setScreenShareEnabled(false);
        if (cameraShareTrackRef.current) {
          try {
            await localParticipant.unpublishTrack(cameraShareTrackRef.current);
            cameraShareTrackRef.current.stop();
          } catch (cleanupErr) {
            console.error('❌ [LiveShare] Cleanup error:', cleanupErr);
          }
          cameraShareTrackRef.current = null;
        }
      }
    }
  };
  
  // 📹 Legacy screen share handler (calls new unified handler)
  const handleStartScreenShare = async () => {
    await handleStartLiveShare('screen');
  };

  // 📹 End LiveShare (stops all tracks)
  const handleEndLiveShare = () => {
    console.log('🛑 [LiveShare] Ending all shares');
    
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
    
    // Stop camera stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
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
    
    setLiveShareMode(null);
    setSharingSource(null);
    setCurrentMedia(null);
    setIsPlaying(false);
    
    sendMessage({
      type: "update_room_status",
      data: {
        is_screen_sharing: false,
        screen_sharing_user_id: 0,
        liveshare_mode: null
      }
    });
    
    toast.success('LiveShare ended');
  };
  
  // 📹 Legacy end screen share handler
  const handleEndScreenShare = () => {
    handleEndLiveShare();
  };
  
  // ✅ LiveShare Mode Selection Handler
  const handleLiveShareModeSelect = (mode, config = null) => {
    console.log('🎬 [LiveShare] Mode selected:', mode, config);
    
    // ✅ If mode is null, end the LiveShare session
    if (mode === null) {
      handleEndLiveShare();
      return;
    }
    
    // Store podcast config for overlay rendering
    if (mode === 'podcast' && config) {
      setPodcastConfig({
        ...config,
        mode: 'podcast',
        hostUsername: currentUser?.username || 'Host' // Add host username
      });
    }
    
    const messageData = { mode };
    
    // Add podcast config if provided
    if (mode === 'podcast' && config) {
      messageData.podcastTitle = config.title;
      messageData.podcastLogoURL = config.logoUrl;
      messageData.guestUserId = config.guestUserId;
    }
    
    sendMessage({
      type: 'liveshare_mode_selected',
      data: messageData
    });
  };
  
  // ✅ LiveShare Type Selection Handler (screen/camera)
  const handleLiveShareTypeSelect = (type) => {
    console.log('🎬 [LiveShare] Type selected:', type);
    sendMessage({
      type: 'liveshare-type-selected',
      data: { type }
    });
    // Start the actual screen/camera share (pass podcast config if available)
    handleStartLiveShare(type, 'liveshare', podcastConfig);
  };
  
  // ✅ Grant LiveShare Permission Handler
  const handleGrantLiveSharePermission = (userId) => {
    console.log('🎬 [LiveShare] Granting permission to user:', userId);
    sendMessage({
      type: 'liveshare-grant-permission',
      data: { user_id: userId }
    });
  };
  
  // ✅ Revoke LiveShare Permission Handler
  const handleRevokeLiveSharePermission = (userId) => {
    console.log('🎬 [LiveShare] Revoking permission from user:', userId);
    sendMessage({
      type: 'liveshare-revoke-permission',
      data: { user_id: userId }
    });
  };
  
  // ✅ Kick LiveShare Guest Handler
  const handleKickLiveShareGuest = (userId) => {
    console.log('🎬 [LiveShare] Kicking guest:', userId);
    sendMessage({
      type: 'liveshare-kick-guest',
      data: { user_id: userId }
    });
  };
  
  // 📹 Handle camera preview from LeftSidebar
  const handleCameraPreview = async (deviceId) => {
    try {
      console.log('📷 [Camera] Starting preview with device:', deviceId);
      
      // Stop existing camera stream
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      
      // Get new camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : true },
        audio: false
      });
      
      setCameraStream(stream);
      
      // Attach to video element if it exists
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
      
      console.log('✅ [Camera] Preview started');
    } catch (err) {
      console.error('❌ [Camera] Preview error:', err);
      toast.error('Failed to access camera');
    }
  };
  
  // 📹 Handle WatchFrom platform screen share
  const handleStartPlatformScreenShare = async (platformId, platformName, platformUrl) => {
    console.log(`🌐 [WatchFrom] Starting platform share: ${platformName}`);
    
    // Open platform in new window
    window.open(platformUrl, '_blank', 'noopener,noreferrer');
    
    // Wait a moment for window to open
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Prompt user to share that specific tab
    try {
      setSharingSource('watchfrom');
      await handleStartLiveShare('screen');
      toast.success(`Share the ${platformName} tab from the browser prompt`);
    } catch (err) {
      toast.error('Screen share cancelled');
      setSharingSource(null);
    }
  };

  // helper functions
  const openProfile = (user) => {
    // Use new avatar click handler with friendship status
    handleAvatarClick(user);
  };

  const openOwnProfile = () => {
    setSelectedUser(currentUser);
    setIsProfileOpen(true);
  };

  const handleSaveProfile = async ({ username, bio, avatarFile }) => {
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      const formData = new FormData();
      
      if (username) formData.append('username', username);
      if (bio) formData.append('bio', bio);
      if (avatarFile) formData.append('avatar', avatarFile);

      const response = await fetch(`${baseUrl}/api/users/profile`, {
        method: 'PUT',
        credentials: 'include', // Include cookies for authentication
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const data = await response.json();
      console.log('✅ Profile updated:', data);
      
      // Refresh user data from server
      const updatedUser = await refreshUser();
      
      // Update selectedUser to show new data in modal
      setSelectedUser(updatedUser);
      
      alert('Profile updated successfully!');
      
    } catch (error) {
      console.error('❌ Failed to update profile:', error);
      alert('Failed to update profile. Please try again.');
    }
  };

  const startChat = (userId) => {
    setIsProfileOpen(false);
    setIsChatOpen(true);
    // Fetch history if not loaded
    if (!privateMessages[userId]?.length) {
      sendMessage({
        type: 'fetch_private_chat',
        data: { other_user_id: userId }
      });
    }
  };

  const sendPrivateMessage = (text) => {
    if (!selectedUser || !text.trim()) return;
    sendMessage({
      type: 'private_chat_message',
      data: {
        to_user_id: selectedUser.id,
        message: text.trim()
      }
    });
    
    // ✅ Optimistic update: Add sent message immediately
    const optimisticMsg = {
      id: Date.now(),
      from_user_id: currentUser.id,
      to_user_id: selectedUser.id,
      message: text.trim(),
      timestamp: Date.now(),
      _optimistic: true
    };
    setPrivateMessages(prev => ({
      ...prev,
      [selectedUser.id]: [...(prev[selectedUser.id] || []), optimisticMsg]
    }));
  };

  return (
    <div 
      className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden"
    >
      {/* 🎬 Loading Overlay - black screen with spinner until camera loads */}
      {loadingStatus && <CinemaLoadingOverlay status={loadingStatus} />}

      {/* 🖥️ Exit Fullscreen Button - shown when in fullscreen */}
      {isFullscreen && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            document.exitFullscreen();
          }}
          className="fixed top-4 left-4 z-[60] bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg backdrop-blur-sm transition-all flex items-center gap-2"
          aria-label="Exit fullscreen"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm font-medium">Exit Fullscreen</span>
        </button>
      )}

      {/* 📱 Mobile: Rotate device prompt (shown when in portrait mode) */}
      {isMobile && isPortrait && <RotateDevicePrompt />}

      {/* 📱 Mobile: One-time tutorial - TEMPORARILY DISABLED */}
      {/* TODO: Re-enable mobile tutorial when ready
      {isMobile && !isPortrait && showTutorial && (
        <MobileCinemaTutorial onComplete={handleTutorialComplete} />
      )}
      */}

      {/* 📱 Mobile: Touch controls for looking left/right - REMOVED: Using fixed circular icons instead */}
      {/* TouchViewControls with full-width sidebar buttons removed in favor of fixed circular icon buttons */}

      {/* Remote Audio Player - renders audio for all remote participants */}
      {room && <RemoteAudioPlayer room={room} silenceMode={isSilenceMode} />}

      {/* Screen activity detector - show arrows on any click/touch */}
      {currentSeat && !isImmersiveMode && (
        <div
          onClick={() => {
            setShowCameraArrows(true);
            if (cameraArrowTimeoutRef.current) {
              clearTimeout(cameraArrowTimeoutRef.current);
            }
            cameraArrowTimeoutRef.current = setTimeout(() => {
              setShowCameraArrows(false);
            }, 5000);
          }}
          className="fixed inset-0 pointer-events-auto z-10"
          style={{ pointerEvents: showCameraArrows ? 'none' : 'auto' }}
        />
      )}

      {/* Camera View Cycling Arrows - Icon only, no blur, responsive */}
      {currentSeat && !isImmersiveMode && showCameraArrows && (
        <>
          {/* Left Arrow - hidden when at leftmost view */}
          {currentCameraView !== 'left' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCycleView('left');
              }}
              className="fixed left-4 sm:left-6 md:left-8 top-1/2 -translate-y-1/2 z-50 text-white hover:text-gray-300 transition-colors"
              aria-label="Look left"
            >
              <svg className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          
          {/* Right Arrow - hidden when at rightmost view */}
          {currentCameraView !== 'right' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCycleView('right');
              }}
              className="fixed right-4 sm:right-6 md:right-8 top-1/2 -translate-y-1/2 z-50 text-white hover:text-gray-300 transition-colors"
              aria-label="Look right"
            >
              <svg className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </>
      )}

      {/* Audio Mode Bar - shows current audio mode (seat/party) - hidden in fullscreen */}
      {!isImmersiveMode && (
        <AudioModeBar
          audioMode={audioMode}
          currentRow={currentSeat ? getRowFromSeat(currentSeatKey) : null}
          isHost={isHost}
          onToggleMode={handleAudioModeToggle}
        />
      )}

      {/* 3D Scene */}
      <CinemaScene3D
        ref={cinemaSceneRef}
        useGLBModel="improved"
        authenticatedUserID={currentUser?.id}
        videoElement={liveShareVideoRef.current || videoRef.current} // ✅ Use LiveShare video if active
        cameraVideoElement={liveShareCameraVideoRef.current || cameraVideoRef.current} // ✅ Use LiveShare camera if active
        gameCanvas={gameCanvas} // 🎮 NEW: Game canvas for screen texture
        podcastCanvas={podcastCanvasRef.current} // 🎙️ Podcast canvas with overlays
        liveShareMode={liveShareMode}
        onAvatarClick={openProfile}
        onVideoTextureUpdate={(fn) => {
          videoTextureUpdateRef.current = fn;
        }}
        isViewLocked={isViewLocked}
        hideLabelsForLocalViewer={isImmersiveMode}
        currentUserSeat={currentSeat}
        showSeatMarkers={showSeatMarkers}
        cinemaSeats={cinemaSeats} // 🎯 Pass seat position data for markers
        showPositionDebug={showPositionDebug} 
        debugMode={true}
        lightsOn={lightsOn}
        darknessLevel={darknessLevel}
        roomMembers={roomMembers}
        userSeats={userSeats} // ✅ Pass seat assignments for avatar filtering
        remoteParticipants={remoteParticipantsMap}
        activeSpeakers={activeSpeakers} // 🎤 Pass active speakers for ripple animation
        showChatBubbles={showChatBubbles} // 💬 User preference for chat bubble visibility
        isChatActive={isChatOpen || showChatHome} // 🚫 Disable keyboard bindings when chat is open
        onEmoteReceived={() => {}}
        onChatMessageReceived={(callback) => {
          triggerChatBubbleRef.current = callback;
        }}
        onEmoteSend={handleEmoteSend}
        triggerLocalEmoteRef={triggerLocalEmoteRef}
        isMobile={isMobile}
        onCameraMove={(pos, lookAt) => { // 🎯 Position Calculator callback
          // Only log when Position Calculator is open to reduce spam
          if (showPositionCalculator) {
            console.log('📸 [onCameraMove]', { pos, lookAt });
          }
          setCurrentCameraPos(pos);
          setCurrentCameraLookAt(lookAt);
        }}
        onScreenClick={handleScreenClick} // 🎬 Click 3D screen to enter fullscreen
      />
      {/* {console.log('🎬 Final roomMembers passed to Taskbar:', roomMembers)} */}
      {/* Taskbar - hidden by default on mobile, tap to reveal */}
      {isTaskbarVisible && (
      <Taskbar
        watchType="3d_cinema"
        classType={null}
        authenticatedUserID={currentUser?.id}
        isAudioActive={isAudioActive}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(prev => !prev)}
        toggleAudio={toggleAudio}
        isMediaPlaying={isPlaying || isImmersiveMode}
        showSeatMarkers={showSeatMarkers}
        onToggleSeatMarkers={setShowSeatMarkers}
        // ✅ NEW: pass view & seat state + handlers
        currentUser={currentUser}
        userSeats={userSeats}
        seatSwapRequest={seatSwapRequest}
        handleSeatSelect={handleSeatSelect}
        isViewLocked={isViewLocked}
        setIsViewLocked={setIsViewLocked}
        lightsOn={lightsOn}
        setLightsOn={setLightsOn}
        showPositionDebug={showPositionDebug}
        onTogglePositionDebug={setShowPositionDebug}
        isHost={isHost}
        isHostBroadcasting={isHostBroadcasting}
        onHostBroadcastToggle={() => {
          const newBroadcastState = !isHostBroadcasting;
          setIsHostBroadcasting(newBroadcastState);
          
          // 🎤 Show notification if host is currently speaking
          if (isAudioActive && currentUser?.username) {
            const currentUserSeatId = userSeats[currentUser?.id];
            const currentUserRow = currentUserSeatId ? parseInt(currentUserSeatId.split('-')[0]) : null;
            
            // Count members in same row
            let rowMemberCount = 0;
            if (currentUserRow !== null) {
              Object.entries(userSeats).forEach(([userId, seatId]) => {
                if (seatId && parseInt(seatId.split('-')[0]) === currentUserRow) {
                  rowMemberCount++;
                }
              });
            }
            
            let notificationText;
            if (newBroadcastState) {
              notificationText = `${currentUser.username} is speaking to everyone`;
            } else if (currentUserRow !== null) {
              notificationText = `${currentUser.username} is speaking to Row ${currentUserRow} (${rowMemberCount} members)`;
            } else {
              notificationText = `${currentUser.username} is speaking`;
            }
            
            showAudioNotification(notificationText);
          }
        }}
        watchSessionMembers={roomMembers} // ✅ pass full list (renamed to watchSessionMembers for Taskbar)
        openChat={() => setShowChatHome(true)}
        onMembersClick={openMembers}
        onShareRoom={() => alert('Share room')}
        onOpenUserProfile={openOwnProfile} // ✅ NEW: Open current user's profile
        onSeatsClick={() => {
          setIsSeatGridModalOpen(current => {
            const newOpenState = !current;
            if (!newOpenState) {
              setOutgoingSwapRequest(null);
            }
            return newOpenState;
          });
        }}
        onTheaterOverviewClick={openTheaterOverview} // ✅ Right-click to open theater overview
        seats={[]}
        isCameraOn={isCameraOn}
        toggleCamera={() => {}}
        onLeaveCall={handleLeaveCall}
        onEmoteSend={handleEmoteSend}
        showEmotes={true}
        showSeatModeToggle={false}
        showVideoToggle={false}
        audioDevices={audioDevices}
        selectedAudioDeviceId={selectedAudioDeviceId}
        onAudioDeviceChange={handleAudioDeviceChange}
        isSilenceMode={isSilenceMode}
        onToggleSilenceMode={() => setIsSilenceMode(!isSilenceMode)}
        broadcastPermissions={broadcastPermissions}
        showChatBubbles={showChatBubbles} // 💬 Chat bubble visibility preference
        onToggleChatBubbles={() => setShowChatBubbles(!showChatBubbles)} // 💬 Toggle handler
        unreadMessages={unreadMessages}
        // 🎮 Game props for cinema mode
        currentGame={currentGame || activeGame}
        onGameClose={handleGameClose}
      />
      )}
      
      {/* 📋 DEBUG: Log Export Button (matches VideoWatch style) */}
      <button
        onClick={handleExportLogs}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 10000,
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          fontSize: '28px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        }}
        title="Copy All Logs to Clipboard (Ctrl+L)"
      >
        📋
      </button>

      {/* Left Sidebar */}
      {isLeftSidebarOpen && (
        <div 
          className="fixed left-0 top-0 h-full w-80 z-40 bg-gray-900/95 backdrop-blur-md"
        >
          <LeftSidebar
            roomId={roomId}
            isLeftSidebarOpen={true}
            isHost={isHost}
            onGameClick={handleGameClick}
            onGameClose={handleGameClose}
            activeGame={activeGame || currentGame}
            watchType="3d_cinema"
            classType={null}
            darknessLevel={darknessLevel}
            onDarknessLevelChange={handleDarknessLevelChange}
            isScreenSharingActive={!!(liveShareMode)}
            sharingSource={sharingSource}
            isLiveKitConnected={isLiveKitConnected}
            onStartScreenShare={handleStartLiveShare}
            onEndScreenShare={handleEndScreenShare}
            isConnected={isConnected}
            playlist={playlist} // ✅ Now populated
            currentUser={currentUser}
            sendMessage={sendMessage}
            onDeleteMedia={(mediaItem) => {
              // Clear saved resume state for this media
              const storageKey = `cinema_playback_${roomId}_${finalSessionId}_${mediaItem.original_name}_${mediaItem.ID}`;
              localStorage.removeItem(storageKey);
              console.log('🗑️ [Resume] Cleared saved state for deleted media:', mediaItem.original_name);
            }}
            onCameraPreview={handleCameraPreview}
            onStartPlatformScreenShare={handleStartPlatformScreenShare}
            onResumeMedia={(media, savedSeekTime) => {
              console.log('▶️ [Resume] Resuming media:', media.original_name, 'at', savedSeekTime, 's');
              
              // ✅ Construct full mediaUrl
              const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
              const fileUrl = media.file_url || media.file_path;
              const mediaUrl = fileUrl.startsWith('http')
                ? fileUrl
                : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;

              const mediaItemWithUrl = {
                ...media,
                type: 'upload',
                mediaUrl,
                original_name: media.original_name || media.file_name || 'Unknown Media',
              };
              
              setCurrentMedia(mediaItemWithUrl);
              setIsPlaying(false); // Start paused
              
              // Seek to saved time after video loads
              const applySeek = () => {
                if (videoRef.current && videoRef.current.readyState >= 2) {
                  videoRef.current.currentTime = savedSeekTime;
                  console.log('⏩ [Resume] Seeked to', savedSeekTime.toFixed(1), 's');
                } else if (videoRef.current) {
                  videoRef.current.addEventListener('loadeddata', () => {
                    videoRef.current.currentTime = savedSeekTime;
                    console.log('⏩ [Resume] Seeked to', savedSeekTime.toFixed(1), 's');
                  }, { once: true });
                }
              };
              
              setTimeout(applySeek, 100);
              
              // Broadcast to members immediately
              if (isHost) {
                sendMessage({
                  type: 'playback_control',
                  command: 'pause',
                  media_item_id: media.ID,
                  file_path: media.file_path,
                  file_url: mediaUrl,
                  original_name: media.original_name,
                  seek_time: savedSeekTime,
                  timestamp: Date.now(),
                  sender_id: currentUser.id,
                });
              }
            }}
            onMediaSelect={(media) => {
              console.log('🎬 [3D] Media selected:', media);
              if (media.type === 'upload') {
                // ✅ Clear saved resume state (user explicitly chose to restart)
                const storageKey = `cinema_playback_${roomId}_${finalSessionId}_${media.original_name}_${media.ID}`;
                localStorage.removeItem(storageKey);
                console.log('🔄 [Resume] Cleared saved state - starting from beginning');
                
                // ✅ Construct full mediaUrl like VideoWatch does
                const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
                const fileUrl = media.file_url || media.file_path || `/uploads/temp/${media.file_name}`;
                const mediaUrl = fileUrl.startsWith('http')
                  ? fileUrl
                  : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;

                const mediaItemWithUrl = {
                  ...media,
                  type: 'upload',
                  mediaUrl, // ✅ critical!
                  original_name: media.original_name || media.file_name || 'Unknown Media',
                };
                setCurrentMedia(mediaItemWithUrl);
                setIsPlaying(true);
                if (isHost) {
                  // ✅ Send playback control message
                  sendMessage({
                    type: "playback_control",
                    command: "play",
                    media_item_id: media.ID || media.id,
                    file_path: media.file_path || media.file_name,
                    file_url: mediaUrl, // ✅ include in WS message
                    original_name: mediaItemWithUrl.original_name,
                    seek_time: 0,
                    timestamp: Date.now(),
                    sender_id: currentUser.id,
                  });
                  
                  // ✅ Auto-update session title with media name
                  if (finalSessionId) {
                    sendMessage({
                      type: 'session_title_update',
                      data: {
                        session_id: finalSessionId,
                        title: mediaItemWithUrl.original_name
                      }
                    });
                  }
                }
              } else if (media.type === 'screen_share') {
                handleStartScreenShare();
              }
            }}
            onClose={() => setIsLeftSidebarOpen(false)}
            onUploadComplete={fetchAndGeneratePosters} // ✅ Refresh after upload
            mousePosition={{ x: 0, y: 0 }}
            sessionId={sessionStatus?.id}
            watchSessionMembers={roomMembers}
            liveShareMode={liveShareMode}
            liveShareGuest={liveShareGuest}
            hasLiveSharePermission={hasLiveSharePermission}
            onLiveShareModeSelect={handleLiveShareModeSelect}
            onLiveShareTypeSelect={handleLiveShareTypeSelect}
            onGrantLiveSharePermission={handleGrantLiveSharePermission}
            onRevokeLiveSharePermission={handleRevokeLiveSharePermission}
            onKickLiveShareGuest={handleKickLiveShareGuest}
          />
        </div>
      )}

      {/* Chat Modal */}
      {isChatOpen && (
        <div 
          className="fixed bottom-24 right-4 w-80 bg-black/80 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center p-3 border-b border-gray-700">
            <h3 className="text-white font-medium">Watch Party Chat</h3>
            <button 
              onClick={() => setIsChatOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="h-64 overflow-y-auto p-3 space-y-2">
            {isChatLoading ? (
              <div className="text-gray-400 text-center py-4">Loading chat...</div>
            ) : sessionChatMessages.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-4">
                Be the first to chat!
              </div>
            ) : (
              sessionChatMessages.map((msg) => {
                // 🎭 Theater badge colors
                const getTheaterBadgeColor = (theaterNumber) => {
                  const colors = [
                    'bg-blue-500 text-white',    // Theater 1
                    'bg-green-500 text-white',   // Theater 2
                    'bg-purple-500 text-white',  // Theater 3
                    'bg-orange-500 text-white',  // Theater 4
                    'bg-pink-500 text-white',    // Theater 5
                    'bg-teal-500 text-white',    // Theater 6
                  ];
                  return colors[(theaterNumber - 1) % colors.length];
                };

                return (
                <div key={msg.ID} className="text-white text-sm group">
                  <div className="flex items-center gap-2">
                    {/* 🎭 Theater Badge - only shown when theater_number exists (2+ theaters) */}
                    {msg.theater_number && (
                      <span 
                        className={`px-1.5 py-0.5 rounded text-xs font-bold ${getTheaterBadgeColor(msg.theater_number)}`}
                        title={msg.theater_name || `Theater ${msg.theater_number}`}
                      >
                        T{msg.theater_number}
                      </span>
                    )}
                    <span className="font-medium text-purple-300">{msg.Username}:</span>
                    <span className="flex-1">{msg.Message}</span>
                  </div>
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {Object.entries(
                        msg.reactions.reduce((acc, r) => {
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
                  <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {['❤️', '😂', '👍'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReactToMessage(msg.ID, emoji)}
                        className="text-lg hover:bg-gray-600 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
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

      {/* Members Modal */}
      {isMembersModalOpen && (
        <MembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          members={roomMembers}
          onMemberClick={openProfile}
          isHost={isHost}
          currentUserId={currentUser?.id}
          audioStates={audioStates}
          broadcastPermissions={broadcastPermissions}
          onToggleBroadcast={handleToggleBroadcast}
          userSeats={userSeats}
          sessionId={finalSessionId}
          userTheaters={userTheaters}
          onRequestBroadcast={handleRequestBroadcast}
          broadcastRequests={broadcastRequests}
          watchType="3d_cinema"
        />
      )}

      {/* Theater Overview Modal */}
      {isTheaterOverviewOpen && (
        <TheaterOverviewModal
          isOpen={isTheaterOverviewOpen}
          onClose={() => setIsTheaterOverviewOpen(false)}
          sessionId={sessionStatus?.id}
          isHost={isHost}
        />
      )}

      {/* 🎮 GAME SYSTEM MODALS */}
      {isGameLobbyOpen && isHost && (
        <GameLobbyModal
          isOpen={isGameLobbyOpen}
          onClose={() => setIsGameLobbyOpen(false)}
          roomMembers={[
            { id: currentUser?.id, username: currentUser?.username },
            ...roomMembers
              .filter(m => m.id !== currentUser?.id) // ✅ Deduplicate: exclude current user
              .map(m => ({
                id: m.id,
                username: m.username || m.name
              }))
          ].filter(m => m.id)}
          currentUserId={currentUser?.id}
          onStartGame={handleStartGame}
        />
      )}
// 🎮 Game Overlay is rendered when a game is active, and receives move updates via WebSocket messages
      {/* ❌ GameOverlay DISABLED for cinema mode - game shows on 3D screen instead */}
      {/* Game interactions happen via clicking the 3D screen (immersive mode) */}
      {/* 
      {(activeGame || currentGame) && (
        <GameOverlay
          activeGame={activeGame || currentGame}
          currentUserId={currentUser?.id}
          onMove={handleGameMove}
          onClose={handleGameClose}
            webSocketService={{ on: () => {}, off: () => {} }}
          />
        );
      })()}
      */}

      {/* 🎮 Hidden Game Canvas Renderer - renders game to canvas for 3D texture */}
      {(activeGame || currentGame) && (() => {
        console.log('🎮 [CinemaScene3D] Rendering GameScreenRenderer with game:', activeGame || currentGame);
        return (
          <GameScreenRenderer
            ref={gameCanvasRendererRef}
            activeGame={activeGame || currentGame}
            currentUserId={currentUser?.id}
            onMove={handleGameMove}
          />
        );
      })()}

      {/* ✅ Seat Grid Modal — NOW INSIDE THE ROOT DIV */}
      <CinemaSeatGridModal
        key={currentUser?.id ? userSeats[currentUser.id] : 'default'}
        isOpen={isSeatGridModalOpen}
        onClose={() => {
          setIsSeatGridModalOpen(false);
          setOutgoingSwapRequest(null);
        }}
        userSeats={userSeats}
        currentUser={currentUser}
        roomMembers={roomMembers}
        seatSwapRequest={seatSwapRequest}
        outgoingSwapRequest={outgoingSwapRequest}
        onSwapAccept={acceptSwap}
        onSwapDecline={declineSwap}
        onTakeSeat={handleSeatSelect}
        isHost={isHost}
        theaters={theaters}
        userTheaters={userTheaters}
      />
      {/* ✅ Fullscreen Mode - Shared video element is already visible (toggled via CSS) */}
      {isImmersiveMode && (
        <div className="fixed inset-0 z-[9999] bg-black" ref={fullscreenContainerRef}>
          {/* ✅ Close button to exit fullscreen (top-left) - auto-hides after 2s of inactivity */}
          <button
            onClick={() => {
              console.log('🚪 Exit fullscreen button clicked!');
              setIsImmersiveMode(false);
            }}
            className={`absolute left-4 top-4 z-[9999] bg-black/70 text-white p-3 rounded-full hover:bg-black/90 transition-all duration-300 ${
              showFullscreenControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="Exit fullscreen"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          
          {/* 🎮 Game fullscreen - render game canvas */}
          {currentGame && gameCanvas && (
            <div 
              className="w-full h-full flex items-center justify-center"
              onClick={(e) => {
                // Calculate click position relative to canvas
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Convert to canvas coordinates (0-1 normalized)
                const normalizedX = x / rect.width;
                const normalizedY = y / rect.height;
                
                console.log('🎮 [Fullscreen Game] Canvas clicked:', { x, y, normalizedX, normalizedY });
                
                // Dispatch click event to canvas
                if (gameCanvasRendererRef.current) {
                  gameCanvasRendererRef.current.handleCanvasClick(normalizedX, normalizedY);
                }
              }}
            >
              <canvas
                ref={(canvas) => {
                  if (canvas && gameCanvas) {
                    // Copy game canvas content to fullscreen canvas
                    canvas.width = gameCanvas.width;
                    canvas.height = gameCanvas.height;
                    const ctx = canvas.getContext('2d');
                    
                    // Continuously update (animation loop)
                    const updateCanvas = () => {
                      ctx.drawImage(gameCanvas, 0, 0);
                      requestAnimationFrame(updateCanvas);
                    };
                    updateCanvas();
                  }
                }}
                className="max-w-full max-h-full object-contain"
                style={{ cursor: 'pointer' }}
              />
            </div>
          )}
          
          {/* ✅ LiveShare fullscreen - use MediaStream objects (same pattern as PositionCalculatorPage) */}
          {!currentGame && (currentMedia?.type === 'liveshare' || remoteScreenTrack || remoteCameraTrack) && (() => {
            // For HOST: use streams from currentMedia
            // For MEMBERS: use MediaStream objects created from LiveKit tracks
            const screenStream = currentMedia?.stream || remoteScreenStream;
            const cameraStream = currentMedia?.cameraStream || remoteCameraStream;
            
            console.log('🎬 [Fullscreen Render] Using MediaStream objects:', {
              hasScreenStream: !!screenStream,
              hasCameraStream: !!cameraStream,
              liveShareMode
            });
            
            return (
              <LiveShareFullscreenCinema
                stream={screenStream}
                cameraStream={cameraStream}
                liveShareMode={liveShareMode}
                podcastConfig={currentMedia?.podcastConfig || podcastConfig}
              />
            );
          })()}
          
          {/* 📹 Upload media container - video element will be moved here */}
          {currentMedia?.type === 'upload' && (
            <div 
              ref={fullscreenUploadContainerRef}
              className="w-full h-full flex items-center justify-center"
              onMouseEnter={() => setIsFullscreenHovering(true)}
              onMouseLeave={() => setIsFullscreenHovering(false)}
            >
              {/* Volume Control - shows on hover */}
              {isFullscreenHovering && (
                <VolumeControl videoRef={videoRef} />
              )}
            </div>
          )}
        </div>
      )}
      {/* Timed View Guidance Overlay - Desktop only */}
      {!isMobile && viewGuidanceMode && Date.now() < viewGuidanceExpiresAt && !isImmersiveMode && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded text-sm z-50 flex items-center gap-3">
          <span>
            {(() => {
              const isMediaPlaying = currentMedia && isPlaying;
              if (viewGuidanceMode === 'initial') {
                return isMediaPlaying
                  ? 'C – Look at screen • R – Look right • F – Fullscreen'
                  : 'C – Look at screen • R – Look right';
              } else {
                return isMediaPlaying
                  ? 'L – Look left • R – Look right • F – Fullscreen'
                  : 'L – Look left • R – Look right';
              }
            })()}
          </span>
          <button
            onClick={() => {
              setViewGuidanceMode(null);
              setViewGuidanceExpiresAt(0);
            }}
            className="text-gray-300 hover:text-white transition-colors ml-1"
            aria-label="Close guidance"
          >
            ✕
          </button>
        </div>
      )}
      {/* User Profile & Chat Modals */}
      {/* Avatar Click Profile Modal (with friendship status) */}
      {isProfileModalOpen && profileModalUser && (
        <UserProfileModal
          user={profileModalUser}
          isOpen={isProfileModalOpen}
          isOwnProfile={profileModalUser?.id === currentUser?.id}
          isInWatchSession={true}
          onClose={() => {
            setIsProfileModalOpen(false);
            setProfileModalUser(null);
            setFriendshipStatus(null);
            setIsRequester(false);
          }}
          onMessage={profileModalUser?.id !== currentUser?.id ? () => {
            const userId = profileModalUser.id;
            setIsProfileModalOpen(false);
            setSelectedUser(profileModalUser);
            setIsChatOpen(true);
          } : undefined}
          onAddFriend={profileModalUser?.id !== currentUser?.id ? handleFriendRequest : undefined}
          friendshipStatus={friendshipStatus}
          isRequester={isRequester}
        />
      )}
      
      {/* Member List Profile Modal (legacy) */}
      {isProfileOpen && (
        <UserProfileModal
          user={selectedUser}
          isOpen={isProfileOpen}
          isOwnProfile={selectedUser?.id === currentUser?.id}
          isInWatchSession={true} // ✅ Show "Add Friend" button in 3D cinema
          onClose={() => {
            setIsProfileOpen(false);
            setSelectedUser(null);
          }}
          onMessage={selectedUser?.id !== currentUser?.id ? () => startChat(selectedUser.id) : undefined}
          onAddFriend={selectedUser?.id !== currentUser?.id ? () => {
            console.log('👥 [CinemaScene3D] Add friend clicked for user:', selectedUser.username);
            // TODO: Implement add friend functionality
            alert(`Friend request sent to ${selectedUser.username}!`);
          } : undefined}
          onSaveProfile={handleSaveProfile}
        />
      )}

      {isChatOpen && selectedUser && (
        <PrivateChatModal
          otherUser={selectedUser}
          messages={privateMessages[selectedUser.id] || []}
          onSendMessage={sendPrivateMessage}
          onClose={() => {
            setIsChatOpen(false);
            setSelectedUser(null);
          }}
          currentUser={currentUser}
          onMarkAsRead={(userId) => {
            setUnreadMessages(prev => ({
              ...prev,
              [userId]: 0
            }));
          }}
        />
      )}
      {/* Chat Entry Modals */}
      {showChatHome && (
        <ChatHomeModal
          roomId={roomId}
          roomMembers={roomMembers}
          privateMessages={privateMessages}
          unreadMessages={unreadMessages}
          currentUser={currentUser}
          onClose={() => setShowChatHome(false)}
          onOpenRoomChat={() => {
            setShowChatHome(false);
            setIsChatOpen(true);
          }}
          onOpenPrivateChat={(user) => {
            setShowChatHome(false);
            setSelectedUser(user);
            setIsProfileOpen(false);
            setIsChatOpen(true);
            
            // ✅ Mark messages from this user as read
            setUnreadMessages(prev => ({
              ...prev,
              [user.id]: 0
            }));
            
            // Fetch history if needed
            if (!privateMessages[user.id]?.length) {
              sendMessage({
                type: 'fetch_private_chat',
                data: { other_user_id: user.id }
              });
            }
          }}
        />
      )}

      {/* 🎤 Floating Audio Notification */}
      {audioNotification && (
        <div
          key={audioNotification.timestamp}
          className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-[1100] pointer-events-none"
          style={{
            animation: 'floatUp 1.5s ease-out forwards'
          }}
        >
          <div className="bg-black/80 backdrop-blur-sm text-white px-6 py-3 rounded-full shadow-2xl border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎤</span>
              <span className="text-sm font-medium whitespace-nowrap">
                {audioNotification.text}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation for floating notification */}
      <style>{`
        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          10% {
            opacity: 1;
          }
          80% {
            opacity: 1;
            transform: translate(-50%, -120px);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -140px);
          }
        }
      `}</style>

      {/* 🎁 Floating Gift Icon - Hide if user is the host */}
      <FloatingGiftIcon
        hostId={sessionStatus?.hostId}
        currentUserId={currentUser?.id}
        tokenBalance={tokenBalance}
        isVisible={!isImmersiveMode && currentUser?.id !== sessionStatus?.hostId}
        isFullscreen={isImmersiveMode}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onGiftSent={(updatedBalance) => {
          // Update local token balance
          setTokenBalance(updatedBalance.token_balance);
        }}
      />

      {/* 🎊 Donation Notifications - Visible to ALL users (including host) */}
      <DonationNotification
        messages={messages}
        currentUserId={currentUser?.id}
      />

      {/* 🎯 Position Calculator Modal */}
      {showPositionCalculator && (
        <div className="fixed top-4 left-4 z-[2000] w-80">
          <div className="bg-gray-900/95 text-white rounded-lg shadow-2xl border border-gray-700 overflow-hidden">
            {/* Live Position Header */}
            <div className="bg-gradient-to-r from-purple-900 to-blue-900 p-3 border-b border-gray-700">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-lg font-bold">🎯 Position Calculator</h2>
                <button
                  onClick={() => setShowPositionCalculator(false)}
                  className="text-gray-300 hover:text-white transition-colors text-xl leading-none -mt-1"
                >
                  ×
                </button>
              </div>
              <div className="space-y-1 text-xs font-mono bg-black/30 rounded p-2">
                <div className="flex items-center gap-2">
                  <span className="text-green-400 font-bold">POS:</span>
                  <span className="text-green-300 flex-1 tracking-tight">
                    [{currentCameraPos.map(n => n.toFixed(2)).join(', ')}]
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 font-bold">LOOK:</span>
                  <span className="text-blue-300 flex-1 tracking-tight">
                    [{currentCameraLookAt.map(n => n.toFixed(2)).join(', ')}]
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Seat Selector with Prev/Next */}
              <div>
                <label className="block text-xs font-medium mb-1">Current Seat</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedSeatId(prev => Math.max(1, prev - 1))}
                    disabled={selectedSeatId === 1}
                    className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-bold transition-colors"
                  >
                    ◀
                  </button>
                  <div className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-center">
                    <div className="text-lg font-bold text-white">Seat {selectedSeatId}</div>
                    <div className="text-[10px] text-gray-400">
                      Row {cinemaSeats.seats.find(s => s.id === selectedSeatId)?.row}, 
                      Seat {cinemaSeats.seats.find(s => s.id === selectedSeatId)?.seatInRow}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSeatId(prev => Math.min(42, prev + 1))}
                    disabled={selectedSeatId === 42}
                    className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-bold transition-colors"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* Controls Info */}
              <div className="bg-blue-900/30 border border-blue-700/50 rounded p-2 text-xs">
                <div className="font-semibold mb-1">Controls:</div>
                <div className="space-y-0.5 text-gray-300 text-[10px]">
                  <div>• <kbd className="bg-gray-700 px-1 py-0.5 rounded text-[10px]">WASD</kbd> - Move camera</div>
                  <div>• <kbd className="bg-gray-700 px-1 py-0.5 rounded text-[10px]">C/V</kbd> - Up/Down</div>
                  <div>• <kbd className="bg-gray-700 px-1 py-0.5 rounded text-[10px]">P</kbd> - Toggle modal</div>
                  <div className="text-yellow-400 mt-1 text-[10px]">✨ View unlocked!</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-1.5">
                <button
                  onClick={() => handleSaveCameraView('center')}
                  className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm font-medium transition-colors"
                >
                  📺 Save Center View
                </button>

                <button
                  onClick={() => {
                    const currentSeat = cinemaSeats.seats.find(s => s.id === selectedSeatId);
                    if (currentSeat?.cameraViews?.center) {
                      const centerData = JSON.stringify({
                        id: currentSeat.id,
                        center: currentSeat.cameraViews.center
                      }, null, 2);
                      navigator.clipboard.writeText(centerData);
                      toast.success(`✅ Seat ${selectedSeatId} center view copied!`);
                    } else {
                      toast.error('No center view saved yet');
                    }
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded text-sm font-medium transition-colors"
                >
                  📋 Copy Current Seat
                </button>

                <button
                  onClick={() => {
                    // Extract only id and center view for all 42 seats
                    const allCenters = cinemaSeats.seats.map(seat => ({
                      id: seat.id,
                      center: seat.cameraViews?.center || null
                    }));
                    const centersText = JSON.stringify(allCenters, null, 2);
                    navigator.clipboard.writeText(centersText);
                    
                    // Count how many have center views
                    const recordedCount = allCenters.filter(s => s.center !== null).length;
                    
                    toast.success(`✅ Copied ${recordedCount}/42 center views!`);
                  }}
                  className="w-full bg-teal-600 hover:bg-teal-700 px-3 py-2 rounded text-sm font-medium transition-colors"
                >
                  📋 Copy All Centers (42 seats)
                </button>

                <button
                  onClick={handleExportJSON}
                  className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  📥 Export Full JSON
                </button>
              </div>

              {/* Current Seat Center View Display */}
              <div className="bg-gray-800 border border-gray-600 rounded p-2">
                <div className="text-xs font-semibold text-gray-300 mb-1">Seat {selectedSeatId} - Center View</div>
                <div className="bg-black/40 rounded p-1.5 font-mono text-[9px] text-green-400">
                  {(() => {
                    const seat = cinemaSeats.seats.find(s => s.id === selectedSeatId);
                    const center = seat?.cameraViews?.center;
                    if (!center) return <div className="text-red-400">No center view saved</div>;
                    return (
                      <>
                        <div className="text-yellow-300">Position:</div>
                        <div className="ml-2 mb-2">[{center.position.map(v => v.toFixed(2)).join(', ')}]</div>
                        <div className="text-yellow-300">LookAt:</div>
                        <div className="ml-2">[{center.lookAt.map(v => v.toFixed(2)).join(', ')}]</div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Instructions */}
              <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-700 leading-tight">
                Position camera for perfect center view → Save Center View → Copy → Next seat (▶)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🎬 Seat Preview Modal (T key) */}
      {showSeatPreview && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div className="absolute top-4 right-4 w-80 pointer-events-auto">
            <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-purple-500 rounded-lg shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-purple-600 px-4 py-2 flex justify-between items-center">
                <div>
                  <div className="text-white font-bold">🎬 Seat Preview</div>
                  <div className="text-xs text-purple-200">Test camera views</div>
                </div>
                <button
                  onClick={() => setShowSeatPreview(false)}
                  className="text-white hover:text-red-300 text-xl font-bold transition-colors"
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                {/* Seat Navigation */}
                <div className="bg-gray-800 border border-gray-700 rounded p-3">
                  <div className="text-xs text-gray-400 mb-2">Navigate Seats</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewSeatId(prev => Math.max(1, prev - 1))}
                      disabled={previewSeatId === 1}
                      className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-bold transition-colors"
                    >
                      ◀
                    </button>
                    <div className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-center">
                      <div className="text-xl font-bold text-white">Seat {previewSeatId}</div>
                      <div className="text-xs text-gray-400">
                        Row {cinemaSeats.seats.find(s => s.id === previewSeatId)?.row}, 
                        Seat {cinemaSeats.seats.find(s => s.id === previewSeatId)?.seatInRow}
                      </div>
                    </div>
                    <button
                      onClick={() => setPreviewSeatId(prev => Math.min(42, prev + 1))}
                      disabled={previewSeatId === 42}
                      className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 px-3 py-1.5 rounded text-sm font-bold transition-colors"
                    >
                      ▶
                    </button>
                  </div>
                  
                  {/* Jump to Seat Input */}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="42"
                      value={previewSeatId}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (val >= 1 && val <= 42) {
                          setPreviewSeatId(val);
                        }
                      }}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                      placeholder="Jump to seat..."
                    />
                    <div className="text-xs text-gray-400">1-42</div>
                  </div>
                </div>

                {/* Camera View Buttons */}
                <div className="bg-gray-800 border border-gray-700 rounded p-3">
                  <div className="text-xs text-gray-400 mb-2">Camera Views</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setPreviewViewType('left');
                        const seat = cinemaSeats.seats.find(s => s.id === previewSeatId);
                        if (seat?.cameraViews?.left && cinemaSceneRef.current) {
                          // Temporarily unlock view for camera movement
                          setIsViewLocked(false);
                          setTimeout(() => {
                            cinemaSceneRef.current.setCameraView(
                              seat.cameraViews.left.position,
                              seat.cameraViews.left.lookAt
                            );
                            toast.success(`📷 Seat ${previewSeatId} - Left view`);
                          }, 50);
                        } else {
                          toast.error('No left view data for this seat');
                        }
                      }}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        previewViewType === 'left'
                          ? 'bg-yellow-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      ⬅️ Left
                    </button>
                    <button
                      onClick={() => {
                        setPreviewViewType('center');
                        const seat = cinemaSeats.seats.find(s => s.id === previewSeatId);
                        if (seat?.cameraViews?.center && cinemaSceneRef.current) {
                          // Temporarily unlock view for camera movement
                          setIsViewLocked(false);
                          setTimeout(() => {
                            cinemaSceneRef.current.setCameraView(
                              seat.cameraViews.center.position,
                              seat.cameraViews.center.lookAt
                            );
                            toast.success(`📷 Seat ${previewSeatId} - Center view`);
                          }, 50);
                        } else {
                          toast.error('No center view data for this seat');
                        }
                      }}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        previewViewType === 'center'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      📺 Center
                    </button>
                    <button
                      onClick={() => {
                        setPreviewViewType('right');
                        const seat = cinemaSeats.seats.find(s => s.id === previewSeatId);
                        if (seat?.cameraViews?.right && cinemaSceneRef.current) {
                          // Temporarily unlock view for camera movement
                          setIsViewLocked(false);
                          setTimeout(() => {
                            cinemaSceneRef.current.setCameraView(
                              seat.cameraViews.right.position,
                              seat.cameraViews.right.lookAt
                            );
                            toast.success(`📷 Seat ${previewSeatId} - Right view`);
                          }, 50);
                        } else {
                          toast.error('No right view data for this seat');
                        }
                      }}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        previewViewType === 'right'
                          ? 'bg-yellow-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      ➡️ Right
                    </button>
                  </div>
                </div>

                {/* Current View Info */}
                <div className="bg-blue-900/30 border border-blue-700/50 rounded p-3">
                  <div className="text-xs font-semibold text-blue-300 mb-1">Current View: {previewViewType.toUpperCase()}</div>
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                    {(() => {
                      const seat = cinemaSeats.seats.find(s => s.id === previewSeatId);
                      const view = seat?.cameraViews?.[previewViewType];
                      if (!view) return 'No view data';
                      return (
                        <>
                          <div className="font-mono">
                            Pos: [{view.position.map(v => v.toFixed(2)).join(', ')}]
                          </div>
                          <div className="font-mono mt-1">
                            LookAt: [{view.lookAt.map(v => v.toFixed(2)).join(', ')}]
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Keyboard Hints */}
                <div className="bg-gray-800/50 border border-gray-700 rounded p-2 text-[10px] text-gray-400">
                  <div className="font-semibold mb-1">Keyboard Shortcuts:</div>
                  <div className="space-y-0.5">
                    <div>• <kbd className="bg-gray-700 px-1 py-0.5 rounded">T</kbd> - Toggle modal</div>
                    <div>• <kbd className="bg-gray-700 px-1 py-0.5 rounded">L/C/R</kbd> - Switch views (when closed)</div>
                    <div>• <kbd className="bg-gray-700 px-1 py-0.5 rounded">◀▶</kbd> - Navigate seats</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div> // 👈 Only one root element
  );
}