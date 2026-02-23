// src/components/cinema/VideoWatch.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';
import useWebSocket from '../../hooks/useWebSocket';
import { getTemporaryMediaItemsForRoom, deleteSingleTemporaryMediaItem, getChatHistory } from '../../services/api';
import apiClient from '../../services/api';
import { getRoom, getRoomMembers, getActiveSession } from '../../services/api';
import { hasTicketCache, clearTicketCache } from '../../utils/ticketCache';
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
import ShareModal from '../ShareModal';
import MembersModal from '../../components/MembersModal.jsx';
import RemoteAudioPlayer from './ui/RemoteAudioPlayer';
import FloatingGiftIcon from '../FloatingGiftIcon';
import DonationNotification from '../DonationNotification';
import axios from 'axios';
// Import sounds
import { playSeatSound, playMicOnSound, playMicOffSound } from '../../utils/audio';
import ChatHomeModal from '../ChatHomeModal.jsx';
import PrivateChatModal from '../PrivateChatModal.jsx';
// Quiz system modals
import QuizManagementModal from './modals/QuizManagementModal';
import MakeQuizModal from './modals/MakeQuizModal';
import TakeQuizModal from './modals/TakeQuizModal';
import QuizResultsModal from './modals/QuizResultsModal';

export default function VideoWatch() {
  const componentIdRef = useRef(`VideoWatch-${Date.now()}`);
  
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
    };
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
  

  const stableTokenRef = useRef(null);
  if (!authLoading && wsToken && !stableTokenRef.current) {
    stableTokenRef.current = wsToken;
  }

  // ✅ Extract session_id from URL for WebSocket connection and instant watch flag
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('session_id');
  const isInstantWatch = urlParams.get('instant') === 'true';
  console.log('🔍 [VideoWatch] Extracted session_id from URL:', urlSessionId);

  const { sendMessage, messages, isConnected, sessionStatus, setBinaryMessageHandler } = useWebSocket(
    roomId,
    stableTokenRef.current,
    urlSessionId  // ✅ Pass session_id to WebSocket so backend can add us to session members
  );

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

  // Handle session errors - redirect if session has ended
  useEffect(() => {
    if (sessionStatus?.error && !sessionStatus?.isActive) {
      console.error('❌ Session error detected:', sessionStatus.error);
      toast.error(sessionStatus.error);
      
      // Clear session_id from URL and navigate back to room page
      setTimeout(() => {
        navigate(`/rooms/${roomId}`, { replace: true });
      }, 2000); // Give user time to read the error message
    }
  }, [sessionStatus?.error, sessionStatus?.isActive, roomId, navigate]);

  // ✅ LIVEKIT INTEGRATION with auto-subscribe (everyone hears everyone)
  const {
    room,
    localParticipant,
    remoteParticipants,
    isConnected: isLiveKitConnected,
    connect: connectLiveKit,
    disconnect: disconnectLiveKit
  } = useLiveKitRoom(roomId, currentUser, true); // ✅ autoSubscribe=true for watch sessions

  // 🎥 ALL STATE DECLARATIONS (must be before useEffects that use them)
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
  
  // 🔍 Debug: Log roomMembers changes
  useEffect(() => {
    console.log('👥 [VideoWatch] roomMembers state changed:', roomMembers);
    console.log('👥 [VideoWatch] roomMembers count:', roomMembers?.length);
  }, [roomMembers]);
  
  // ✅ Fetch session members from API (active watch session participants)
  useEffect(() => {
    console.log('🔄 [fetchSessionMembers useEffect] TRIGGERED with roomId:', roomId);
    
    const fetchSessionMembers = async () => {
      console.log('🚀 [fetchSessionMembers] Function starting...');
      console.log('🔍 [fetchSessionMembers] roomId value:', roomId, 'type:', typeof roomId);
      
      if (!roomId) {
        console.warn('⚠️ [fetchSessionMembers] No roomId, ABORTING fetch');
        return;
      }
      
      try {
        console.log('📡 [fetchSessionMembers] ✅ About to call getActiveSession API for room:', roomId);
        const response = await getActiveSession(roomId);
        console.log('📥 [fetchSessionMembers] ✅ API call completed successfully');
        console.log('📥 [fetchSessionMembers] Full response object:', response);
        console.log('📥 [fetchSessionMembers] response.data:', response.data);
        console.log('📥 [fetchSessionMembers] response.data type:', typeof response.data);
        console.log('📥 [fetchSessionMembers] response.data.members:', response.data?.members);
        
        const sessionMembers = response.data?.members || [];
        console.log('👥 [fetchSessionMembers] Extracted sessionMembers array:', sessionMembers);
        console.log('👥 [fetchSessionMembers] sessionMembers.length:', sessionMembers.length);
        console.log('👥 [fetchSessionMembers] Is array?:', Array.isArray(sessionMembers));
        
        if (sessionMembers.length > 0) {
          console.log('✅ [fetchSessionMembers] Found', sessionMembers.length, 'members:');
          sessionMembers.forEach((m, idx) => {
            console.log(`  Member ${idx + 1}:`, {
              user_id: m.user_id,
              username: m.username,
              user_role: m.user_role,
              raw: m
            });
          });
        } else {
          console.warn('⚠️ [fetchSessionMembers] sessionMembers array is EMPTY');
        }
        
        // Transform to match component format
        console.log('🔄 [fetchSessionMembers] Transforming members to component format...');
        const formattedMembers = sessionMembers.map(member => {
          const formatted = {
            id: member.user_id,
            Username: member.username || `User ${member.user_id}`,
            username: member.username || `User ${member.user_id}`,
            avatar_url: member.avatar_url || null,
            user_role: member.user_role || 'viewer',
          };
          console.log('  Formatted member:', formatted);
          return formatted;
        });
        
        console.log('📤 [fetchSessionMembers] About to call setRoomMembers with', formattedMembers.length, 'members');
        console.log('📤 [fetchSessionMembers] formattedMembers:', formattedMembers);
        setRoomMembers(formattedMembers);
        console.log('✅ [fetchSessionMembers] setRoomMembers called successfully');
        
      } catch (error) {
        console.error('❌ [fetchSessionMembers] API call FAILED');
        console.error('❌ [fetchSessionMembers] Error object:', error);
        console.error('❌ [fetchSessionMembers] Error message:', error?.message);
        console.error('❌ [fetchSessionMembers] Error response:', error?.response);
        console.error('❌ [fetchSessionMembers] Error response data:', error?.response?.data);
        console.error('❌ [fetchSessionMembers] Error response status:', error?.response?.status);
        // Don't show error to user - member list will populate from WebSocket events
      }
    };
    
    console.log('⏱️ [fetchSessionMembers useEffect] About to call fetchSessionMembers()...');
    fetchSessionMembers();
    console.log('⏱️ [fetchSessionMembers useEffect] fetchSessionMembers() called (async, will complete later)');
  }, [roomId]);
  
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [screenShareUrl, setScreenShareUrl] = useState(null);
  const sidebarRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const chatEndRef = useRef(null);
  const videoPlayerRef = useRef(null); // 🎬 Direct access to video element
  const [localScreenTrack, setLocalScreenTrack] = useState(null);
  const [pendingSeekTime, setPendingSeekTime] = useState(null); // ⏱️ State-based seek (triggers re-renders)
  
  // 📹 LiveShare state (screen + camera)
  const [liveShareMode, setLiveShareMode] = useState(null); // 'screen', 'camera', 'both'
  const [sharingSource, setSharingSource] = useState(null); // 'liveshare' | 'watchfrom' | null
  const screenShareTrackRef = useRef(null);
  const cameraShareTrackRef = useRef(null);
  const liveShareVideoRef = useRef(null); // Separate ref for LiveShare main video
  const liveShareCameraVideoRef = useRef(null); // Separate ref for LiveShare PIP camera
  const [screenShareTrackSid, setScreenShareTrackSid] = useState(null);
  const [cameraShareTrackSid, setCameraShareTrackSid] = useState(null);

  // 📝 QUIZ SYSTEM STATE
  const [quizzes, setQuizzes] = useState([]); // All quizzes in this session
  const [activeQuiz, setActiveQuiz] = useState(null); // Currently in-progress quiz
  const [currentQuizData, setCurrentQuizData] = useState(null); // Quiz for student to take
  const [quizResults, setQuizResults] = useState(null); // Student's results
  const [isQuizManagementOpen, setIsQuizManagementOpen] = useState(false);
  const [isMakeQuizOpen, setIsMakeQuizOpen] = useState(false);
  const [isTakeQuizOpen, setIsTakeQuizOpen] = useState(false);
  const [isQuizResultsOpen, setIsQuizResultsOpen] = useState(false);
  
  // 🎤 Audio device management
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(null);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const publishedAudioTrackRef = useRef(null);

  // ✅ Track active session ID for ending sessions
  const [activeSessionId, setActiveSessionId] = useState(null);

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

  // 🎭 Determine if current user is host (MUST BE BEFORE useEffects that use isHost)
  const isHost = React.useMemo(() => {
    // ✅ Primary: Use sessionStatus.hostId from WebSocket
    // ✅ Fallback: Use roomHostId from session_status members
    const hostId = sessionStatus?.hostId || roomHostId;
    const result = currentUser?.id === hostId;
    
    return result;
  }, [currentUser?.id, sessionStatus?.hostId, roomHostId]);

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
        
        // Trigger re-render to pick up new video track
        setRemoteParticipants(prev => [...prev]);
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
      
      // ✅ VIDEO CLEANUP: Trigger re-render when video track removed
      if (track.kind === 'video') {
        console.log('📹 [VideoWatch] Video track unsubscribed:', {
          source: publication.source,
          participant: participant.identity
        });
        
        // Trigger re-render to update UI
        setRemoteParticipants(prev => [...prev]);
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
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      
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
    
    console.log('📹 [VideoWatch] Video subscription effect running');
    console.log('📹 [VideoWatch] Room state:', room.state);

    const handleTrackPublished = (publication, participant) => {
      console.log('🎬 [VideoWatch MEMBER] RoomEvent.TrackPublished fired!', {
        source: publication.source,
        kind: publication.kind,
        trackSid: publication.trackSid,
        participant: participant.identity,
        isSubscribed: publication.isSubscribed
      });
      
      // ✅ Subscribe to all video tracks (screen share, camera)
      if (publication.kind === 'video') {
        console.log('📹 [VideoWatch MEMBER] Video track detected, subscribing:', publication.trackSid);
        publication.setSubscribed(true);
        
        // Force re-render to detect new track
        setRemoteParticipants(prev => [...prev]);
      }
    };

    // ✅ Subscribe to any existing video tracks on mount
    console.log('📹 [VideoWatch] Checking for existing video tracks...');
    console.log('📹 [VideoWatch] Remote participants count:', room.remoteParticipants.size);
    console.log('📹 [VideoWatch] Room.remoteParticipants:', Array.from(room.remoteParticipants.keys()));
    
    room.remoteParticipants.forEach((participant) => {
      console.log('📹 [VideoWatch] Participant:', participant.identity, {
        videoTrackPublications: participant.videoTrackPublications.size,
        audioTrackPublications: participant.audioTrackPublications.size
      });
      
      participant.videoTrackPublications.forEach((publication) => {
        console.log('📹 [VideoWatch] Found existing video publication:', {
          participant: participant.identity,
          trackSid: publication.trackSid,
          source: publication.source,
          isSubscribed: publication.isSubscribed,
          track: !!publication.track
        });
        
        if (!publication.isSubscribed) {
          console.log('📹 [VideoWatch MEMBER] Subscribing to existing video track:', {
            participant: participant.identity,
            trackSid: publication.trackSid,
            source: publication.source
          });
          publication.setSubscribed(true);
        } else {
          console.log('📹 [VideoWatch] Track already subscribed');
        }
      });
    });

    // Listen for new track publications
    room.on(RoomEvent.TrackPublished, handleTrackPublished);
    console.log('✅ [VideoWatch] TrackPublished listener registered');

    // ✅ POLLING: Check for new video tracks every 2 seconds (fallback if TrackPublished doesn't fire)
    const pollInterval = setInterval(() => {
      console.log('🔄 [VideoWatch] Polling for video tracks...');
      room.remoteParticipants.forEach((participant) => {
        participant.videoTrackPublications.forEach((publication) => {
          if (!publication.isSubscribed && publication.kind === 'video') {
            console.log('🔄 [VideoWatch] Found unsubscribed video track during poll:', {
              participant: participant.identity,
              trackSid: publication.trackSid,
              source: publication.source
            });
            publication.setSubscribed(true);
            setRemoteParticipants(prev => [...prev]);
          }
        });
      });
    }, 2000);

    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished);
      clearInterval(pollInterval);
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
    toast.info('Results view coming soon!');
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
    if (!video || !currentMedia || liveShareMode) return;

    const handleLoadedData = () => {
      console.log('✅ [VideoWatch] Video data loaded', {
        readyState: video.readyState,
        currentTime: video.currentTime,
        isPlaying,
        hasPendingSeek: pendingSeekTime !== null,
        pendingSeekTime
      });
      
      // 🎯 Apply pending seek time if available (for mid-playback sync)
      if (pendingSeekTime !== null && pendingSeekTime > 0) {
        console.log(`🎯 [VideoWatch] Applying pending seek time: ${pendingSeekTime}s`);
        video.currentTime = pendingSeekTime;
        setPendingSeekTime(null); // Clear after applying
      }
      
      if (isPlaying) {
        console.log('▶️ [VideoWatch] Starting playback after load...');
        video.play().catch(err => console.error('❌ [VideoWatch] Failed to play:', err));
      } else {
        console.log('⏸️ [VideoWatch] Video loaded but isPlaying=false, not starting playback');
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
    if (!sessionStatus.id) {
      alert('Session not ready yet.');
      return;
    }
    const url = `${window.location.origin}/watch/${roomId}?session_id=${sessionStatus.id}`;
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
    // ✅ Construct full URL for uploaded media
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
    const fileUrl = mediaItem.file_url || filePath;
    const mediaUrl = fileUrl.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
    
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
    
    console.log('🎬 [VideoWatch] Host about to send playback_control:', {
      isHost,
      isConnected,
      mediaUrl: normalizedMediaItem.mediaUrl,
      currentUserId: currentUser?.id
    });
    
    if (isHost && isConnected) {
      const playbackMsg = {
        type: "playback_control",
        command: "play",
        media_item_id: id,
        file_path: filePath,
        file_url: normalizedMediaItem.mediaUrl, // ✅ add this
        original_name: normalizedMediaItem.original_name,
        seek_time: 0,
        timestamp: Date.now(),
        sender_id: currentUser.id,
      };
      console.log('📤 [VideoWatch] HOST SENDING playback_control:', playbackMsg);
      sendMessage(playbackMsg);
    } else {
      console.warn('⚠️ [VideoWatch] NOT sending playback_control:', {
        isHost,
        isConnected,
        reason: !isHost ? 'Not host' : 'Not connected'
      });
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
      const currentSeekTime = Math.floor(playbackPositionRef.current);
      console.log(`⏰ [VideoWatch] Periodic seek time update: ${currentSeekTime}s`);
      
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
        await localParticipant.setScreenShareEnabled(true, {
          audio: true,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
          simulcast: false,
          videoBitrate: 3000000
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
          // Use first available camera
          const device = videoDevices[0];
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: device.deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 }
            },
            audio: false
          });
          
          console.log('✅ [VideoWatch] Camera stream acquired');
          
          // Create LocalVideoTrack and publish
          const videoTrack = stream.getVideoTracks()[0];
          const LocalVideoTrack = (await import('livekit-client')).LocalVideoTrack;
          const localVideoTrack = new LocalVideoTrack(videoTrack);
          
          const cameraPublication = await localParticipant.publishTrack(localVideoTrack, {
            source: Track.Source.Camera,
            name: 'camera-share',
            simulcast: false,
            videoEncoding: {
              maxBitrate: 4000000,
              maxFramerate: 30
            }
          });
          
          console.log('✅ [VideoWatch HOST] Camera track published:', {
            trackSid: cameraPublication.trackSid,
            source: cameraPublication.source,
            kind: cameraPublication.kind,
            isPublished: true,
            trackName: cameraPublication.trackName
          });
          console.log('📡 [VideoWatch HOST] Track should now be visible to all remote participants');
          console.log('📡 [VideoWatch HOST] Remote participants count:', room.remoteParticipants.size);
          
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
    
    setLiveShareMode(null);
    setSharingSource(null);
    setIsScreenSharingActive(false);
    setCurrentMedia(null);
    setIsPlaying(false);
    
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
        // Use backend-generated poster or fallback to placeholder
        poster_url: item.poster_url || '/icons/placeholder-poster.jpg'
      }));
      
      setPlaylist(normalizedItems);
    } catch (err) {
      console.error("Failed to fetch media items:", err);
      if (err.response?.status === 404) {
        alert("This session has ended.");
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
    console.log('📨 [VideoWatch] Messages array length:', messages?.length, 'Processed:', processedMessageCountRef.current);
    const newMessages = messages.slice(processedMessageCountRef.current);
    console.log('📨 [VideoWatch] New messages to process:', newMessages.length);
    if (newMessages.length === 0) return;

    newMessages.forEach((message) => {
      console.log('📨 [VideoWatch] Processing message type:', message.type, 'data:', message.data);
      switch (message.type) {
        case "session_status":
          const data = message.data;
          console.log('📊 [VideoWatch] session_status received - FULL DATA:', data);
          console.log('📊 [VideoWatch] session_status members field:', data.members);
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
            console.log(`✅ [VideoWatch] Setting ${membersArray.length} session members:`, membersArray);
            setRoomMembers(membersArray);
            
            // ✅ Request current audio states from all members in the room
            console.log('🎤 [VideoWatch] Requesting audio states from all members');
            sendMessage({
              type: "request_audio_states",
              userId: currentUser?.id,
            });
          } else {
            console.error('❌ [VideoWatch] session_status members is NOT an array!', typeof data.members, data.members);
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
          if (message.data?.currently_playing && currentMedia?.type !== 'screen_share') {
            setCurrentMedia(prev => ({
              ...prev,
              original_name: message.data.currently_playing,
              type: message.data.is_screen_sharing ? 'screen_share' : 'upload',
            }));
          } else if (message.data?.currently_playing && currentMedia?.type === 'screen_share') {
            if (currentMedia.original_name !== message.data.currently_playing) {
              setCurrentMedia(prev => ({ ...prev, original_name: message.data.currently_playing }));
            }
          }
          break;
        case "screen_share_stopped":
          if (currentMedia?.type === 'screen_share') {
            setCurrentMedia(null);
          }
          setIsPlaying(false);
          setIsScreenSharingActive(false);
          setScreenSharerUserId(null);
          showNotification('Screen sharing ended', 'info');
          break;
        
        // ✅ SESSION MEMBER EVENTS - Track active watch session participants
        case 'session_member_joined':
          // Real-time member join from backend
          console.log('📨 [VideoWatch] session_member_joined RAW:', message);
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
        case "playback_control":
          console.log('📥 [VideoWatch] RECEIVED playback_control:', {
            sender_id: message.sender_id,
            currentUserId: currentUser?.id,
            command: message.command,
            file_path: message.file_path,
            file_url: message.file_url,
            timestamp: message.timestamp
          });
          
          if (message.sender_id && message.sender_id === currentUser?.id) {
            console.log('⏭️ [VideoWatch] Ignoring own playback_control message');
            break;
          }
          
          if (message.file_path) {
            const isSameMedia = currentMedia && currentMedia.file_path === message.file_path;
            console.log('🔍 [VideoWatch] Playback control check:', {
              isSameMedia,
              currentMediaPath: currentMedia?.file_path,
              newMediaPath: message.file_path,
              isPlaying,
              newCommand: message.command
            });
            
            if (!isSameMedia || isPlaying !== (message.command === "play")) {
              // ✅ Construct full URL for uploaded media
              const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
              const fileUrl = message.file_url || message.file_path;
              const mediaUrl = fileUrl.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
              
              console.log('✅ [VideoWatch] MEMBER loading media:', {
                mediaUrl,
                original_name: message.original_name
              });
              
              setCurrentMedia({
                ID: message.media_item_id,
                type: 'upload',
                file_path: message.file_path,
                mediaUrl: mediaUrl,
                original_name: message.original_name || 'Unknown Media',
              });
              const now = Date.now();
              const latency = now - message.timestamp;
              const adjustedTime = message.seek_time + (latency / 1000);
              console.log('⏱️ [VideoWatch] Latency compensation:', {
                latency_ms: latency,
                seek_time: message.seek_time,
                adjusted_time: adjustedTime,
                command: message.command,
                current_isPlaying: isPlaying,
                will_change_playState: message.command === "play" || message.command === "pause"
              });
              setPendingSeekTime(adjustedTime); // ✅ Use state instead of ref
              
              // 🎯 FIX: Only update play/pause for explicit play/pause commands, not seek-only
              if (message.command === "play" || message.command === "pause") {
                setIsPlaying(message.command === "play");
                console.log(`🎬 [VideoWatch] ${message.command === "play" ? "Playing" : "Pausing"} video from playback_control`);
              }
              // For "seek" commands, maintain current play state
            } else {
              console.log('⏭️ [VideoWatch] Skipping - same media and state');
            }
          } else {
            console.warn('⚠️ [VideoWatch] playback_control missing file_path!');
          }
          break;
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
          // Session ended by host - cleanup and navigate to RoomPage
          console.log('🛑 [WebSocket] Session ended by host');
          console.log('📋 Session data:', message.data);
          
          // ✅ Clear private messages and unread counts
          setPrivateMessages({});
          setUnreadMessages({});
          
          // Clear ticket cache for this session
          if (urlSessionId) {
            clearTicketCache(message.data?.session_id || urlSessionId);
            console.log('🗑️ [VideoWatch] Cleared ticket cache for ended session');
          }
          
          // ✅ Store session data for rating modal (if not the host)
          const isCurrentUserHost = currentUser?.id === message.data?.host_id;
          if (!isCurrentUserHost && message.data?.session_id) {
            console.log('⭐ [VideoWatch] Storing session data for rating modal');
            sessionStorage.setItem(`pending_rating_${roomId}`, JSON.stringify({
              sessionId: message.data.session_id,
              hostId: message.data.host_id,
              hostName: message.data.host_name || 'Unknown Host',
              sessionTitle: message.data.session_title || 'Untitled Session',
              watchType: message.data.watch_type,
              isTemporary: message.data.is_temporary || false,
            }));
          }
          
          // ✅ Show toast notification with appropriate message
          const reason = message.data?.reason;
          if (reason === 'host_timeout') {
            toast('Session ended - Host disconnected for over 10 minutes', {
              icon: '⏰',
              duration: 5000,
            });
          } else {
            toast('Videowatch session ended', {
              icon: 'ℹ️',
              duration: 3000,
            });
          }
          
          // Perform cleanup and navigate
          performCleanupAndExit();
          break;
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
          
        default:
          console.warn("[VideoWatch] Unknown WebSocket message type:", message.type, message);
      }
    });
    processedMessageCountRef.current = messages.length;
  }, [messages, sessionStatus.id, currentUser?.id, currentMedia, localParticipant]);

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
    // � Get the current session ID (prioritize WebSocket over API state)
    const finalSessionId = sessionStatus?.id || urlSessionId || activeSessionId;

    if (isHost) {
      // Host: Show confirmation dialog
      const confirmed = window.confirm(
        "End watch session for everyone? All participants will be returned to the lobby."
      );

      if (!confirmed) {
        return; // User canceled, stay in session
      }

      // Host confirmed: End the session
      try {
        if (finalSessionId) {
          await apiClient.post(`/api/rooms/${roomId}/sessions/${finalSessionId}/end`);
          
          // ✅ Set flag to prevent showing stale session UI on RoomPage
          sessionStorage.setItem(`session_ended_${roomId}`, 'true');
          
          // Small delay to ensure backend broadcasts before navigation
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error('❌ [VideoWatch] Failed to end session:', error);
        // Continue with cleanup even if API call fails
      }
    }
    
    // Cleanup and exit (both host and members)
    await performCleanupAndExit();
  };

  // Cleanup and navigate helper
  const performCleanupAndExit = async () => {
    console.log('🧹 Performing cleanup and exit...');

    // 1. Disconnect LiveKit
    if (disconnectLiveKit) {
      try {
        await disconnectLiveKit();
        console.log('✅ LiveKit disconnected');
      } catch (error) {
        console.error('⚠️ Error disconnecting LiveKit:', error);
      }
    }

    // 2. Stop camera stream
    if (cameraPreviewStream) {
      cameraPreviewStream.getTracks().forEach(track => track.stop());
      setCameraPreviewStream(null);
      console.log('✅ Camera stream stopped');
    }

    // 3. Clear chat messages
    setSessionChatMessages([]);
    setNewSessionMessage('');
    setIsChatOpen(false);
    console.log('✅ Chat cleared');

    // 4. WebSocket cleanup happens automatically via useWebSocket cleanup

    // 5. Force navigation: if this was a temporary room (instant watch), go back to lobby; otherwise go to room page
    try {
      console.log('🔍 [VideoWatch] Checking session data for redirect...');
      const sessionDataStr = sessionStorage.getItem(`pending_rating_${roomId}`);
      let isTemporary = false;
      
      // Try to get is_temporary from session data if available
      if (sessionDataStr) {
        try {
          const sessionData = JSON.parse(sessionDataStr);
          isTemporary = sessionData.isTemporary || false;
          console.log('🔍 [VideoWatch] is_temporary from session data:', isTemporary);
        } catch (e) {
          console.error('⚠️ [VideoWatch] Error parsing session data:', e);
        }
      }
      
      // Fallback: check URL parameter (for backwards compatibility)
      if (!isTemporary) {
        const urlParams = new URLSearchParams(window.location.search);
        const instantParam = urlParams.get('instant');
        isTemporary = instantParam === 'true';
        console.log('🔍 [VideoWatch] is_temporary from URL fallback:', isTemporary);
      }
      
      if (isTemporary) {
        console.log('✅ [VideoWatch] Temporary room detected - navigating to Lobby...');
        navigate('/lobby', { replace: true });
      } else {
        console.log('✅ [VideoWatch] Persistent room - navigating to RoomPage...');
        navigate(`/rooms/${roomId}`, { replace: true });
      }
    } catch (err) {
      console.error('⚠️ [VideoWatch] Error checking room type:', err);
      console.log('🏠 [VideoWatch] Navigating to RoomPage (fallback)...');
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
      setRoomMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [roomId]);

  // 🔊 Toggle broadcast permission for a user (host only)
  const handleToggleBroadcast = useCallback((userId, currentState) => {
    if (!isHost) return; // Only host can toggle
    
    const messageType = currentState ? 'revoke_broadcast' : 'grant_broadcast';
    
    sendMessage({
      type: messageType,
      session_id: sessionStatus.id,
      user_id: userId
    });
  }, [isHost, sessionStatus.id, sendMessage]);

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

  // ✅ Host-only: Toggle mute all members (locked mute, requires host approval to unmute)
  const handleMuteAll = useCallback(() => {
    if (!isHost) {
      console.warn('🚫 [VideoWatch] Non-host attempted to toggle mute all');
      return;
    }

    const newMuteState = !isMuteAllActive;
    console.log(`🔇 [VideoWatch] Host toggling mute all: ${newMuteState ? 'ON' : 'OFF'}`);
    console.log('🔇 [VideoWatch] sendMessage exists:', !!sendMessage);
    console.log('🔇 [VideoWatch] currentUser.id:', currentUser?.id);
    console.log('🔇 [VideoWatch] sessionStatus?.id:', sessionStatus?.id);
    
    if (newMuteState) {
      // Muting all members
      const message = {
        type: "mute_all_members",
        hostId: currentUser.id,
        sessionId: sessionStatus?.id,
      };
      console.log('🔇 [VideoWatch] Sending mute_all_members message:', message);
      sendMessage(message);

      setIsMuteAllActive(true);
      toast.success('All members have been muted', {
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
  }, [isHost, isMuteAllActive, sendMessage, currentUser, sessionStatus]);

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

  // ✅ FIND SCREEN SHARE TRACK FROM LIVEKIT (MUST BE BEFORE EARLY RETURN)
  const remoteScreenTrack = React.useMemo(() => {
    if (!room) {
      console.log('⚠️ [VideoWatch] No room connected');
      return null;
    }

    console.log('🔍 [VideoWatch] Searching for remote screen share in room');
    
    // Access participants directly from room for latest state
    const participants = Array.from(room.remoteParticipants.values());
    console.log('👥 [VideoWatch] Remote participants in room:', participants.length);
    
    // Log all tracks for debugging
    participants.forEach(p => {
      const audioTracks = p?.audioTrackPublications || new Map();
      const videoTracks = p?.videoTrackPublications || new Map();
      console.log(`👤 [VideoWatch] Participant ${p.identity}:`, {
        audioTracks: audioTracks.size,
        videoTracks: videoTracks.size
      });
    });
    
    const screenPub = participants
      .flatMap(p => {
        console.log('👤 [VideoWatch] Checking participant:', p.identity);
        console.log('   Participant keys:', Object.keys(p));
        console.log('   videoTracks:', p.videoTracks);
        console.log('   videoTrackPublications:', p.videoTrackPublications);
        
        const tracks = p?.videoTrackPublications || p?.videoTracks;
        if (!tracks || tracks.size === 0) {
          console.log('  ⚠️ No video tracks');
          return [];
        }
        const trackArray = Array.from(tracks.values());
        console.log('  📹 Video tracks:', trackArray.map(t => ({ source: t.source, track: !!t.track })));
        return trackArray;
      })
      .find(pub => pub?.source === Track.Source.ScreenShare);
    
    if (screenPub?.track) {
      console.log('✅ [VideoWatch] Found remote screen share track!');
      return screenPub.track;
    }
    
    console.log('⚠️ [VideoWatch] No remote screen share track found');
    return null;
  }, [room, remoteParticipants]); // Depend on both room and remoteParticipants

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
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading your cinema experience...</div>
      </div>
    );
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
      
      {/* 🔇 Mute All Banner */}
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
          className="h-8 w-8 sm:h-6 sm:w-6 p-1 touch-manipulation"
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
      <CinemaVideoPlayer
        ref={videoPlayerRef}
        mediaItem={currentMedia}
        isPlaying={isPlaying}
        isHost={isHost}
        track={remoteScreenTrack}
        localScreenTrack={localScreenTrack}
        playbackPositionRef={playbackPositionRef}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleVideoEnd}
        onError={handleError}
        onPauseBroadcast={handlePauseBroadcast}
        onTimeUpdate={handleTimeUpdate}
        // ❌ REMOVED: onBinaryHandlerReady, onScreenShareReady (not needed with LiveKit)
      />
      
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
          showEmotes={false}
          openChat={openChat}
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
            isHost={isHost}
            onClose={() => setIsLeftSidebarOpen(false)}
            onUploadComplete={fetchAndGeneratePosters}
            sessionId={activeSessionId} // ✅ Pass session ID for uploads
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
        isHost={isHost}
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
        onMuteAll={handleMuteAll}
        isMuteAllActive={isMuteAllActive}
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
        hostId={roomHostId}
        currentUserId={currentUser?.id}
        tokenBalance={tokenBalance}
        isVisible={!showCinemaSeatView}
        isFullscreen={showCinemaSeatView}
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

      {/* 📝 QUIZ SYSTEM MODALS */}
      {isQuizManagementOpen && isHost && (
        <QuizManagementModal
          isOpen={isQuizManagementOpen}
          onClose={() => setIsQuizManagementOpen(false)}
          isHost={isHost}
          quizzes={quizzes}
          activeQuiz={activeQuiz}
          onCreateQuiz={handleCreateQuiz}
          onViewResults={handleViewResults}
          sendMessage={sendMessage}
          currentUser={currentUser}
        />
      )}

      {isMakeQuizOpen && isHost && (
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
    </div>
  );
}