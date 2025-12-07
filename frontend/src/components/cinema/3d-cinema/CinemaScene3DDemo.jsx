// src/components/cinema/3d-cinema/CinemaScene3DDemo.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '../../../hooks/useAuth';
import useWebSocket from '../../../hooks/useWebSocket';
import { getChatHistory } from '../../../services/api';
import apiClient from '../../../services/api';
import CinemaScene3D from './CinemaScene3D';
import Taskbar from '../../Taskbar';
import LeftSidebar from '../ui/LeftSidebar';
import MembersModal from '../../MembersModal';
import TheaterOverviewModal from '../../TheaterOverviewModal';
import CinemaSeatGridModal from './ui/CinemaSeatGridModal';
import CinemaVideoPlayer from '../ui/CinemaVideoPlayer';
import { useFrame } from '@react-three/fiber';
// In CinemaScene3DDemo.jsx
import useLiveKitRoom from "../../../hooks/useLiveKitRoom"; // 3 dots!
import { Track, ParticipantEvent } from 'livekit-client';
import { getTemporaryMediaItemsForRoom } from '../../../services/api';
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

export default function CinemaScene3DDemo() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation(); // 👈 get navigation state
  // === Derive host status ===
  const { isHost: isHostFromState = false, sessionId: sessionIdFromState } = location.state || {};
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get('session_id');
  const finalSessionId = sessionIdFromState || sessionIdFromUrl;
  const { currentUser, wsToken, loading: authLoading, refreshUser } = useAuth();
  const stableTokenRef = useRef(null);
  const [showSeatMarkers, setShowSeatMarkers] = useState(false);
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
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isHostBroadcasting, setIsHostBroadcasting] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(null);
  const chatEndRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const [isViewLocked, setIsViewLocked] = useState(true);   // ✅ ADD THIS
  const [lightsOn, setLightsOn] = useState(true);          // ✅ ADD THIS
  const [isSeatGridModalOpen, setIsSeatGridModalOpen] = useState(false);
  const [outgoingSwapRequest, setOutgoingSwapRequest] = useState(null); // { targetUserId, targetSeatId }
  const [showChatHome, setShowChatHome] = useState(false);
  
  // 🔇 Silence mode state
  const [isSilenceMode, setIsSilenceMode] = useState(false);
  
  // 🔊 Broadcast permissions (userId -> boolean)
  const [broadcastPermissions, setBroadcastPermissions] = useState({});
  const [remoteAudioStates, setRemoteAudioStates] = useState({});
  
  // 🎭 Theater assignments (userId -> {theater_number, seat_row, seat_col})
  const [userTheaters, setUserTheaters] = useState({});
  const [broadcastRequests, setBroadcastRequests] = useState([]); // Array of user IDs with pending requests
  const [theaters, setTheaters] = useState([]); // List of all theaters for this session
  
  const { currentSeat, jumpToSeat, currentSeatKey } = useSeatController({
    currentUser,
    //initialSeatId: currentUser ? `${Math.floor((currentUser.id % 42) / 7)}-${(currentUser.id % 42) % 7}` : '0-0',
    initialSeatId: null, // ← let it be null
    onSeatChange: (seatKey, seatData) => {
      // Optional: send to server
      if (sendMessage && currentUser) {
        const [rowStr, colStr] = seatKey.split('-');
        sendMessage({
          type: 'take_seat',
          seat_id: seatKey,
          row: parseInt(rowStr),
          col: parseInt(colStr),
          user_id: currentUser.id
        });
      }
    }
  });

  const [showDemoAvatars, setShowDemoAvatars] = useState(true);
  // State for video ref
  const videoRef = useRef(null);
  const videoInitializedRef = useRef(false);
  const screenMeshRef = useRef(null);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  // Ref to trigger local emote notification in CinemaScene3D
  const triggerLocalEmoteRef = useRef(null);
  
  // Initialize emote sounds
  const { playEmoteSound } = useEmoteSounds();
  
  // 🔊 User join sound
  const joinSoundRef = useRef(null);
  
  // 🎤 Floating audio notification state
  const [audioNotification, setAudioNotification] = useState(null); // { text: string, timestamp: number }
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
 
  const [currentTime, setCurrentTime] = useState(0);
  // === VIDEO/PLAYBACK STATE ===
  const [currentMedia, setCurrentMedia] = useState(null);
  // === MEDIA PLAYLIST STATE ===
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState(null);
  const [localScreenTrack, setLocalScreenTrack] = useState(null);
  const playbackPositionRef = useRef(0);
  //const isHostFromState = location.state?.isHost;
  // Fallback host detection (for direct URL access)
  const isHostFromMembers = currentUser?.id === roomMembers.find(m => m.user_role === 'host')?.id;
  const isHost = isHostFromState ?? isHostFromMembers;
  const fullscreenVideoRef = useRef(null);
  const [showPositionDebug, setShowPositionDebug] = useState(false);
  // Add this ref to store the update function
  const videoTextureUpdateRef = useRef(null);
  // 1:1 Chat state
  const [selectedUser, setSelectedUser] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  //const [isChatOpen, setIsChatOpen] = useState(false);
  const [privateMessages, setPrivateMessages] = useState({}); // { userId: [messages] }

  // ✅ Now you have reliable isHost!
  //console.log('🎭 isHost (from RoomPage):', isHost);
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
    if (sendMessage) {
      sendMessage({
        type: 'update_lights',
        data: { lightsOn: newLightsState }
      });
    }
  };

  // livekit setup
  const {
    room,
    localParticipant,
    remoteParticipants,
    connect: connectLiveKit,
    disconnect: disconnectLiveKit
  } = useLiveKitRoom(roomId, currentUser);

  useEffect(() => {
    if (roomId && currentUser) connectLiveKit();
    return () => {
      // Cleanup: unpublish audio track
      if (publishedAudioTrackRef.current) {
        publishedAudioTrackRef.current.stop();
        publishedAudioTrackRef.current = null;
      }
      disconnectLiveKit();
    };
  }, [roomId, currentUser?.id]);

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
      setViewGuidanceExpiresAt(Date.now() + 300_000);
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
        setViewGuidanceExpiresAt(Date.now() + 300_000);
      } else if (key === 'l' || key === 'f') {
        setViewGuidanceExpiresAt(Date.now() + 300_000);
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
      if (e.key.toLowerCase() === 'f') {
        toggleImmersiveMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImmersiveMode]);

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

  // Fetch media items (same as VideoWatch)
  const fetchAndGeneratePosters = useCallback(async () => {
    if (!roomId || !currentUser) return;
    try {
      const mediaItems = await getTemporaryMediaItemsForRoom(roomId);
      const normalized = mediaItems.map(item => ({
        ...item,
        ID: item.ID || item.id,
        poster_url: item.poster_url || '/icons/placeholder-poster.jpg'
      }));
      setPlaylist(normalized);
    } catch (err) {
      console.error("Failed to fetch media:", err);
      setPlaylist([]);
    }
  }, [roomId, currentUser]);

  // Fetch on mount
  useEffect(() => {
    fetchAndGeneratePosters();
  }, [fetchAndGeneratePosters]);

  // ✅ Also fetch session status on mount (like VideoWatch)
  useEffect(() => {
    if (roomId && sessionIdFromUrl) {
      // Optional: validate session ID with backend
      // But WebSocket will sync state anyway
    }
  }, [roomId, sessionIdFromUrl]);
  // logging
  useEffect(() => {
    console.log('🎭 roomMembers:', roomMembers);
    //console.log('🤖 Demo users:', roomMembers.filter(u => u.is_demo));
  }, [roomMembers]);

  // 👇 Change to 0-based row numbers (row 2 = 3rd row, row 3 = 4th row)
  useEffect(() => {
    if (!showDemoAvatars) return;

    const demoUsers = [];
    const newSeats = {}; // 👈 track seat assignments

    // Rows 3-4 in UI = rows 2-3 in 0-based indexing
    for (let row = 2; row <= 3; row++) {
      for (let col = 0; col < 7; col++) {
        const demoId = `demo-${row}-${col}`;
        demoUsers.push({
          id: demoId,
          username: `Guest ${row + 1}-${col + 1}`,
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

  // Remote track
  useEffect(() => {
    if (!room) return;
    const participants = Array.from(room.remoteParticipants.values());
    const screenPub = participants.flatMap(p => Array.from((p.videoTrackPublications || new Map()).values()))
      .find(pub => pub.source === Track.Source.ScreenShare);
    setRemoteScreenTrack(screenPub?.track || null);
  }, [room]);

  // ✅ Attach media to hidden <video> for 3D screen texture + track currentTime
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Clean up previous stream
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    video.src = '';

    // Clean up ONLY if source type is changing (upload ↔ screen)
    const isScreenMode = (isHost && localScreenTrack?.mediaStreamTrack) || (!isHost && remoteScreenTrack?.mediaStreamTrack);
    const isUploadMode = currentMedia?.type === 'upload' && currentMedia.mediaUrl;

    // Pause current playback to avoid race
    video.pause();

    if (isScreenMode) {
      const track = isHost ? localScreenTrack.mediaStreamTrack : remoteScreenTrack.mediaStreamTrack;
      const stream = new MediaStream([track]);
      // Only reassign if stream actually changed
      if (video.srcObject !== stream) {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(t => t.stop());
        }
        video.srcObject = stream;
        video.muted = isHost;
        video.play().catch(e => console.warn("Play failed (screen share):", e));
      }
    } else if (isUploadMode) {
      const newUrl = currentMedia.mediaUrl;
      if (video.src !== newUrl) {
        video.srcObject = null; // Clear stream if any
        video.src = newUrl;
        video.muted = false;
        video.load();
        video.play().catch(e => console.warn("Play failed (upload):", e));
      }
    } else {
      // No media: clear safely
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
      video.src = '';
    }

    // 👇 Cleanup: remove listener and stop tracks
    return () => {
      video.removeEventListener('timeupdate', updateTime);
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
    };
  }, [currentMedia, isHost, localScreenTrack, remoteScreenTrack]);

  // Sync full screen with cinema screen
  useEffect(() => {
    if (!isImmersiveMode) return;

    const fullscreenVideo = fullscreenVideoRef.current;
    if (!fullscreenVideo) return;

    // Wait for video to load metadata (so seeking works)
    const handleLoaded = () => {
      // Seek to 3D screen's current time
      if (Math.abs(fullscreenVideo.currentTime - currentTime) > 0.1) {
        fullscreenVideo.currentTime = currentTime;
      }
      // Play/pause to match state
      if (isPlaying) {
        fullscreenVideo.play().catch(console.warn);
      }
    };

    if (fullscreenVideo.readyState >= 1) {
      // Already loaded
      handleLoaded();
    } else {
      // Wait for load
      fullscreenVideo.addEventListener('loadedmetadata', handleLoaded, { once: true });
      return () => fullscreenVideo.removeEventListener('loadedmetadata', handleLoaded);
    }
  }, [isImmersiveMode, currentTime, isPlaying]);

  useEffect(() => {
    if (videoInitializedRef.current) return;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.muted = false;
    video.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
    document.body.appendChild(video);
    videoRef.current = video;
    videoInitializedRef.current = true;

    // ✅ ADD: timeupdate for 3D sync
    const updateTime = () => {
      setCurrentTime(video.currentTime);
      // Notify 3D screen to update texture
      if (videoTextureUpdateRef.current) {
        videoTextureUpdateRef.current();
      }
    };
    video.addEventListener('timeupdate', updateTime);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      if (videoRef.current) {
        document.body.removeChild(videoRef.current);
        videoRef.current = null;
      }
      videoInitializedRef.current = false;
    };
  }, []);

  // Sync the fullscreen with the 3d video in fullscreen play
  useEffect(() => {
    if (!isImmersiveMode) return;

    const fullscreenVideo = fullscreenVideoRef.current;
    if (!fullscreenVideo) return;

    // Sync play/pause state
    if (isPlaying && fullscreenVideo.paused) {
      fullscreenVideo.play().catch(console.warn);
    } else if (!isPlaying && !fullscreenVideo.paused) {
      fullscreenVideo.pause();
    }

    // Sync time (if difference is > 200ms)
    if (Math.abs(fullscreenVideo.currentTime - currentTime) > 0.2) {
      fullscreenVideo.currentTime = currentTime;
    }
  }, [isImmersiveMode, currentTime, isPlaying]);

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
 
  // Auto-assign current user to their seat on mount
  useEffect(() => {
    if (currentUser && currentSeatKey && !userSeats[currentUser.id]) {
      console.log('🪑 [CinemaScene3D] Auto-assigning current user to seat:', currentSeatKey);
      
      // Set locally
      setUserSeats(prev => {
        if (prev[currentUser.id]) return prev; // already set
        return { ...prev, [currentUser.id]: currentSeatKey };
      });
      
      // Broadcast to backend and other clients
      if (sendMessage) {
        const [rowStr, colStr] = currentSeatKey.split('-');
        sendMessage({
          type: 'take_seat',
          seat_id: currentSeatKey,
          row: parseInt(rowStr),
          col: parseInt(colStr),
          user_id: currentUser.id
        });
        console.log('📡 [CinemaScene3D] Broadcasted seat assignment to backend');
      }
    }
  }, [currentUser, currentSeatKey, userSeats, sendMessage]);

  // === Process WebSocket messages ===
  useEffect(() => {
    const newMessages = messages.slice(processedMessageCountRef.current);
    newMessages.forEach((msg) => {
      // ✅ Let the hook handle seat swap messages FIRST
      if (handleSeatSwapMessage(msg)) {
        return; // Hook handled it — skip rest
      }

      // ⚠️ All other messages
      switch (msg.type) {
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
          if (msg.data.session_id === sessionStatus.id) {
            setSessionChatMessages(prev => {
              const exists = prev.some(m => m.ID === msg.data.ID);
              return exists ? prev : [...prev, { ...msg.data, reactions: msg.data.reactions || [] }];
            });
          }
          break;
       
        case 'update_lights':
          if (msg.data?.lightsOn !== undefined) {
            setLightsOn(msg.data.lightsOn);
          }
          break;
        case 'take_seat':
          if (msg.user_id && msg.seat_id) {
            console.log('🪑 [CinemaScene3D] Received take_seat broadcast:', {
              user_id: msg.user_id,
              seat_id: msg.seat_id,
              isCurrentUser: msg.user_id === currentUser?.id
            });
            setUserSeats(prev => {
              const updated = {
                ...prev,
                [msg.user_id]: msg.seat_id
              };
              console.log('🪑 [CinemaScene3D] Updated userSeats:', updated);
              return updated;
            });
          }
          break;
        case "playback_control":
          if (msg.sender_id && msg.sender_id === currentUser?.id) break;
          if (msg.file_path) {
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
            const fileUrl = msg.file_url || msg.file_path;
            const mediaUrl = fileUrl.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
            setCurrentMedia({
              ID: msg.media_item_id,
              type: 'upload',
              file_path: msg.file_path,
              mediaUrl: mediaUrl,
              original_name: msg.original_name || 'Unknown Media',
            });
            setIsPlaying(msg.command === "play");
          }
          break;
        case "screen_share_started":
          setCurrentMedia({ type: 'screen_share', title: 'Live Screen Share' });
          setIsPlaying(true);
          break;
        case "screen_share_stopped":
          setRemoteScreenTrack(null);
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
          // msg shape: { user_seats: {"7":"2-3"}, usernames: {"7":"chibi"} }
          const incomingUserSeats = msg.user_seats || (msg.data && msg.data.user_seats);
          const incomingUsernames = msg.usernames || (msg.data && msg.data.usernames);
          
          console.log('🪑 [CinemaScene3D] Received seats_auto_assigned:', {
            incomingUserSeats,
            incomingUsernames,
            currentUserSeats: userSeats
          });
          
          if (incomingUserSeats) {
            // ✅ MERGE instead of REPLACE to preserve existing seat assignments
            setUserSeats(prev => {
              const merged = { ...prev, ...incomingUserSeats };
              console.log('🪑 [CinemaScene3D] Merged userSeats:', {
                previous: prev,
                incoming: incomingUserSeats,
                merged
              });
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
                  acc.push({ id: idNum, username: incomingUsernames[uidStr], user_role: 'viewer' });
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
          // Process seating assignments from backend
          if (msg.data.seating && typeof msg.data.seating === 'object') {
            console.log('🪑 [CinemaScene3D] Received seating assignments from backend:', msg.data.seating);
            setUserSeats(prev => {
              const updated = { ...prev };
              // Backend sends { "5-0": 7, "4-6": 8 } - convert to { 7: "5-0", 8: "4-6" }
              Object.entries(msg.data.seating).forEach(([seatId, userId]) => {
                updated[userId] = seatId;
              });
              console.log('🪑 [CinemaScene3D] Updated userSeats from session_status:', updated);
              return updated;
            });
          }

          // ✅ REPLACE strategy: Clear all non-demo members and rebuild from fresh data
          // This prevents accumulation of stale/disconnected users
          setRoomMembers(prev => {
            const demoUsers = prev.filter(u => u.is_demo);
            const freshMembers = new Map();
            
            // ✅ Build set of active user IDs from seated_usernames (backend-filtered)
            const activeUserIDs = new Set();
            if (msg.data.seated_usernames && typeof msg.data.seated_usernames === 'object') {
              Object.keys(msg.data.seated_usernames).forEach(userIdStr => {
                activeUserIDs.add(parseInt(userIdStr, 10));
              });
            }
            // Always include current user
            if (currentUser) {
              activeUserIDs.add(currentUser.id);
            }
            
            console.log('🪑 [CinemaScene3D] Active user IDs from backend:', Array.from(activeUserIDs));
            
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
            }
            
            // ✅ CLIENT-SIDE FILTER: Only process members who are in activeUserIDs
            // This is a safety net in case backend sends unfiltered data
            if (Array.isArray(msg.data.members)) {
              let filtered = 0;
              let accepted = 0;
              msg.data.members.forEach(m => {
                const id = m.user_id || m.id;
                if (!id) return;
                
                // ✅ ONLY accept if user is in activeUserIDs (from seated_usernames)
                if (!activeUserIDs.has(id)) {
                  filtered++;
                  return; // Skip stale users
                }
                
                if (!freshMembers.has(id)) {
                  freshMembers.set(id, {
                    id,
                    username: m.username || m.Username || m.name || `User${id}`,
                    user_role: m.user_role || 'viewer'
                  });
                  accepted++;
                }
              });
              console.log(`🪑 [CinemaScene3D] Members filtering: ${accepted} accepted, ${filtered} filtered out of ${msg.data.members.length} total`);
            }
            
            const finalMembers = Array.from(freshMembers.values());
            
            console.log('🪑 [CinemaScene3D] Rebuilt roomMembers (REPLACE strategy):', {
              demo: demoUsers.length,
              fresh: finalMembers.length,
              members: finalMembers.map(u => ({ id: u.id, username: u.username }))
            });
            
            return [...finalMembers, ...demoUsers];
          });
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
          if (msg.to_user_id === currentUser?.id || msg.from_user_id === currentUser?.id) {
            const otherUserId = msg.from_user_id === currentUser?.id ? msg.to_user_id : msg.from_user_id;
            setPrivateMessages(prev => ({
              ...prev,
              [otherUserId]: [...(prev[otherUserId] || []), msg]
            }));
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
          // Real-time update when a user joins
          if (msg.data?.userId && msg.data?.username) {
            setRoomMembers(prev => {
              const exists = prev.some(m => m.id === msg.data.userId);
              if (exists) return prev;
              return [...prev, {
                id: msg.data.userId,
                username: msg.data.username,
                user_role: 'viewer'
              }];
            });
          }
          break;
        case 'participant_leave':
          // Real-time update when a user leaves
          if (msg.data?.userId) {
            console.log('👋 [CinemaScene3D] User left:', msg.data.userId);
            setRoomMembers(prev => {
              const updated = prev.filter(m => m.id !== msg.data.userId);
              console.log('👋 [CinemaScene3D] Updated roomMembers after user left:', {
                before: prev.length,
                after: updated.length,
                removedUser: prev.find(m => m.id === msg.data.userId)?.username
              });
              return updated;
            });
            // Remove their seat assignment
            setUserSeats(prev => {
              const updated = { ...prev };
              delete updated[msg.data.userId];
              console.log('🪑 [CinemaScene3D] Updated seats after user left:', updated);
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
          
          // Update roomMembers with fresh seated users
          if (msg.data.seated_usernames && typeof msg.data.seated_usernames === 'object') {
            setRoomMembers(prev => {
              const demoUsers = prev.filter(u => u.is_demo);
              const freshMembers = new Map();
              
              // Keep current user
              if (currentUser) {
                freshMembers.set(currentUser.id, {
                  id: currentUser.id,
                  username: currentUser.username || `User${currentUser.id}`,
                  user_role: 'viewer'
                });
              }
              
              // Add only active seated users (backend already filtered)
              Object.entries(msg.data.seated_usernames).forEach(([userIdStr, username]) => {
                const userId = parseInt(userIdStr, 10);
                if (!freshMembers.has(userId)) {
                  freshMembers.set(userId, {
                    id: userId,
                    username: username,
                    user_role: 'viewer'
                  });
                }
              });
              
              const finalMembers = [...Array.from(freshMembers.values()), ...demoUsers];
              console.log('🔄 [CinemaScene3D] Refreshed roomMembers:', {
                before: prev.length,
                after: finalMembers.length,
                members: finalMembers.map(m => ({ id: m.id, username: m.username, is_demo: m.is_demo }))
              });
              return finalMembers;
            });
          }
          break;
        
        case 'session_ended':
          // Session ended - either manually by host or auto-ended after grace period
          console.log('🔚 [CinemaScene3D] Session ended:', msg.data);
          
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
        
        default:
          break;
      }
    });
    processedMessageCountRef.current = messages.length;
  }, [messages, sessionStatus?.id, currentUser?.id, handleSeatSwapMessage]); // ✅ add hook to deps
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
    console.log('🚪 [CinemaScene3D] Leaving call...');
    
    // ✅ HOST: Show confirmation and end session for everyone
    if (isHost) {
      const confirmed = window.confirm(
        "End this 3D Cinema session for everyone? All participants will be returned to the lobby."
      );
      
      if (!confirmed) {
        console.log('❌ [CinemaScene3D] Host cancelled leave - staying in session');
        return; // Host cancelled, stay in session
      }
      
      // Host confirmed - end the session
      try {
        if (finalSessionId) {
          console.log('🛑 [CinemaScene3D] Host ending session:', finalSessionId);
          await apiClient.post(`/api/rooms/watch-sessions/${finalSessionId}/end`);
          console.log('✅ [CinemaScene3D] Session ended successfully');
        }
      } catch (error) {
        console.error('❌ [CinemaScene3D] Failed to end session:', error);
        // Continue with cleanup even if API call fails
      }
    }
    
    try {
      // 1. Unpublish audio track if active
      if (isAudioActive && publishedAudioTrackRef.current && localParticipant) {
        console.log('🎤 [CinemaScene3D] Unpublishing audio track...');
        await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
        publishedAudioTrackRef.current.stop();
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
  const publishedAudioTrackRef = useRef(null);

  // 🎤 Toggle audio with LiveKit publishing
  const toggleAudio = async () => {
    console.log('🎤 [CinemaScene3D] toggleAudio called, current state:', isAudioActive);
    console.log('🎤 [CinemaScene3D] Room state:', room?.state);
    console.log('🎤 [CinemaScene3D] LocalParticipant:', !!localParticipant);
    const newState = !isAudioActive;
    console.log('🎤 [CinemaScene3D] New state will be:', newState);

    if (!localParticipant) {
      console.warn('⚠️ [CinemaScene3D] No localParticipant - LiveKit not connected yet. Please wait...');
      alert('Please wait for LiveKit to connect before toggling audio.');
      return;
    }

    try {
      if (newState) {
        // Enable: Publish microphone
        console.log('🎤 [CinemaScene3D] Publishing microphone...');
        
        // Stop and unpublish old track if exists
        if (publishedAudioTrackRef.current) {
          try {
            await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
            publishedAudioTrackRef.current.stop();
          } catch (err) {
            console.warn('⚠️ [CinemaScene3D] Failed to unpublish old track:', err);
          }
          publishedAudioTrackRef.current = null;
        }

        // Create new audio track with selected device
        const constraints = {
          deviceId: selectedAudioDeviceId ? { exact: selectedAudioDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        };

        console.log('🎤 [CinemaScene3D] Creating audio track with constraints:', constraints);
        console.log('🎤 [CinemaScene3D] Selected device ID:', selectedAudioDeviceId);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        const audioTrack = stream.getAudioTracks()[0];
        console.log('🎤 [CinemaScene3D] Got audio track:', audioTrack.label);
        console.log('🎤 [CinemaScene3D] Audio track enabled:', audioTrack.enabled);

        // Publish to LiveKit
        const publication = await localParticipant.publishTrack(audioTrack, {
          name: 'microphone',
          source: 'microphone', // ✅ Explicitly set source
        });
        publishedAudioTrackRef.current = audioTrack;
        console.log('✅ [CinemaScene3D] Microphone published successfully');
        console.log('✅ [CinemaScene3D] Publication source:', publication.source);
        console.log('✅ [CinemaScene3D] Publication kind:', publication.kind);
        
        setIsAudioActive(true);
        
        // 🎤 Show floating notification (only on unmute)
        if (currentUser?.username) {
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
          
          // ✅ Check if user has broadcast permission
          const hasUserBroadcastPermission = broadcastPermissions[currentUser?.id] || false;
          const isGlobalBroadcast = (isHost && isHostBroadcasting) || hasUserBroadcastPermission;
          
          let notificationText;
          if (isGlobalBroadcast) {
            notificationText = `${currentUser.username} is speaking to everyone`;
          } else if (currentUserRow !== null) {
            notificationText = `${currentUser.username} is speaking to Row ${currentUserRow} (${rowMemberCount} members)`;
          } else {
            notificationText = `${currentUser.username} is speaking`;
          }
          
          showAudioNotification(notificationText);
        }
      } else {
        // Disable: Unpublish microphone
        console.log('🎤 [CinemaScene3D] Unpublishing microphone...');
        if (publishedAudioTrackRef.current) {
          await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
          publishedAudioTrackRef.current.stop();
          publishedAudioTrackRef.current = null;
          console.log('✅ [CinemaScene3D] Microphone unpublished');
        }
        setIsAudioActive(false);
      }

      // Send WebSocket message for UI state sync
      if (sendMessage) {
        const currentUserSeatId = userSeats[currentUser?.id];
        const currentUserRow = currentUserSeatId ? parseInt(currentUserSeatId.split('-')[0]) : null;
        
        // ✅ Check if user has broadcast permission
        const hasUserBroadcastPermission = broadcastPermissions[currentUser?.id] || false;
        const isGlobalBroadcast = (isHost && isHostBroadcasting) || hasUserBroadcastPermission;
        
        sendMessage({
          type: 'user_audio_state',
          userId: currentUser?.id,
          isAudioActive: newState,
          isSeatedMode: isSeatedMode,
          isGlobalBroadcast: isGlobalBroadcast,
          row: isSeatedMode && currentUserRow !== null ? currentUserRow : null,
        });
      }
    } catch (err) {
      console.error('❌ [CinemaScene3D] Failed to toggle audio:', err);
      // Revert state on error
      setIsAudioActive(isAudioActive);
    }
  };

  // 🎤 Handle audio device change
  const handleAudioDeviceChange = async (deviceId) => {
    console.log('🎤 [CinemaScene3D] Changing audio device to:', deviceId);
    setSelectedAudioDeviceId(deviceId);

    // If currently active, republish with new device
    if (isAudioActive && localParticipant && publishedAudioTrackRef.current) {
      try {
        // Unpublish current track
        await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
        publishedAudioTrackRef.current.stop();
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
      console.error('Failed to fetch theaters:', error);
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

  // Convert remoteParticipants array to Map for O(1) lookup
  const remoteParticipantsMap = React.useMemo(() => {
    const map = new Map();
    remoteParticipants.forEach(participant => {
      map.set(participant.identity, participant);
    });
    return map;
  }, [remoteParticipants]);

  // === Render ===
  if (authLoading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  // ✅ Handle screen share like VideoWatch
  const handleStartScreenShare = async () => {
    if (!localParticipant) {
      alert('LiveKit not ready');
      return;
    }
    try {
      await localParticipant.setScreenShareEnabled(true);
      setCurrentMedia({ type: 'screen_share', title: 'Live Screen Share' });
      setIsPlaying(true);
      sendMessage({
        type: "update_room_status",
        data: {
          is_screen_sharing: true,
          screen_sharing_user_id: currentUser.id,
          currently_playing: "Live Screen Share"
        }
      });
    } catch (err) {
      console.error("Screen share error:", err);
      alert("Failed to start screen share");
    }
  };

  const handleEndScreenShare = () => {
    if (localParticipant) {
      localParticipant.setScreenShareEnabled(false);
    }
    setCurrentMedia(null);
    setIsPlaying(false);
    sendMessage({
      type: "update_room_status",
      data: {
        is_screen_sharing: false,
        screen_sharing_user_id: 0,
      }
    });
  };

  // helper functions
  const openProfile = (user) => {
    setSelectedUser(user);
    setIsProfileOpen(true);
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
    // Optimistic update
    const newMsg = {
      id: Date.now(),
      from_user_id: currentUser.id,
      to_user_id: selectedUser.id,
      message: text.trim(),
      timestamp: Date.now()
    };
    setPrivateMessages(prev => ({
      ...prev,
      [selectedUser.id]: [...(prev[selectedUser.id] || []), newMsg]
    }));
  };

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Remote Audio Player - renders audio for all remote participants */}
      {room && <RemoteAudioPlayer room={room} silenceMode={isSilenceMode} />}

      {/* 3D Scene */}
      <CinemaScene3D
        useGLBModel="improved"
        authenticatedUserID={currentUser?.id}
        videoElement={videoRef.current}
        onAvatarClick={openProfile}
        onVideoTextureUpdate={(fn) => {
          videoTextureUpdateRef.current = fn;
        }}
        isViewLocked={isViewLocked}
        hideLabelsForLocalViewer={isImmersiveMode}
        currentUserSeat={currentSeat}
        showSeatMarkers={showSeatMarkers}
        showPositionDebug={showPositionDebug} 
        debugMode={true}
        lightsOn={lightsOn}
        roomMembers={roomMembers}
        userSeats={userSeats} // ✅ Pass seat assignments for avatar filtering
        remoteParticipants={remoteParticipantsMap}
        onEmoteReceived={() => {}}
        onChatMessageReceived={() => {}}
        onEmoteSend={handleEmoteSend}
        triggerLocalEmoteRef={triggerLocalEmoteRef}
      />
      {/* {console.log('🎬 Final roomMembers passed to Taskbar:', roomMembers)} */}
      {/* Taskbar */}
      <Taskbar
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
        roomMembers={roomMembers} // ✅ pass full list
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
      />

      {/* Left Sidebar */}
      {isLeftSidebarOpen && (
        <div 
          className="fixed left-0 top-0 h-full w-80 z-40 bg-gray-900/95 backdrop-blur-md"
        >
          <LeftSidebar
            roomId={roomId}
            isLeftSidebarOpen={true}
            isScreenSharingActive={!!(isHost ? localScreenTrack : remoteScreenTrack)}
            onStartScreenShare={handleStartScreenShare}
            onEndScreenShare={handleEndScreenShare}
            isConnected={isConnected}
            playlist={playlist} // ✅ Now populated
            currentUser={currentUser}
            sendMessage={sendMessage}
            onDeleteMedia={() => {}} // optional: implement if needed
            onMediaSelect={(media) => {
              console.log('🎬 [3D] Media selected:', media);
              if (media.type === 'upload') {
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
                }
              } else if (media.type === 'screen_share') {
                handleStartScreenShare();
              }
            }}
            onCameraPreview={() => {}}
            isHost={isHost}
            onClose={() => setIsLeftSidebarOpen(false)}
            onUploadComplete={fetchAndGeneratePosters} // ✅ Refresh after upload
            mousePosition={{ x: 0, y: 0 }}
            sessionId={sessionStatus?.id}
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
          audioStates={remoteAudioStates}
          broadcastPermissions={broadcastPermissions}
          onToggleBroadcast={handleToggleBroadcast}
          userSeats={userSeats}
          sessionId={sessionId}
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
      {/* ✅ Immersive Fullscreen Video — using shared player */}
      {isImmersiveMode && (
        <div className="absolute inset-0 z-50 bg-black" onClick={e => e.stopPropagation()}>
          <CinemaVideoPlayer
            ref={fullscreenVideoRef}
            mediaItem={currentMedia}
            isHost={isHost}
            track={remoteScreenTrack}
            localScreenTrack={localScreenTrack}
            isPlaying={isPlaying}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={handleError}
            muted={true}
          />
        </div>
      )}
      {/* Timed View Guidance Overlay */}
      {viewGuidanceMode && Date.now() < viewGuidanceExpiresAt && !isImmersiveMode && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded text-sm z-50">
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
        </div>
      )}
      {/* User Profile & Chat Modals */}
      {isProfileOpen && (
        <UserProfileModal
          user={selectedUser}
          isOpen={isProfileOpen}
          isOwnProfile={selectedUser?.id === currentUser?.id}
          onClose={() => {
            setIsProfileOpen(false);
            setSelectedUser(null);
          }}
          onMessage={selectedUser?.id !== currentUser?.id ? () => startChat(selectedUser.id) : undefined}
          onSaveProfile={handleSaveProfile}
        />
      )}

      {isChatOpen && selectedUser && (
        <PrivateChatModal
          otherUser={selectedUser}
          messages={privateMessages[selectedUser.id] || []}
          onSendMessage={sendPrivateMessage}
          onBack={() => {
            setIsChatOpen(false);
            setIsProfileOpen(true);
          }}
          onClose={() => {
            setIsChatOpen(false);
            setSelectedUser(null);
          }}
          currentUser={currentUser}
        />
      )}
      {/* Chat Entry Modals */}
      {showChatHome && (
        <ChatHomeModal
          roomId={roomId}
          roomMembers={roomMembers}
          privateMessages={privateMessages}
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
      <style jsx>{`
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
    </div> // 👈 Only one root element
  );
}