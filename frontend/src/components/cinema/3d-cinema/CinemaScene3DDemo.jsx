// src/components/cinema/3d-cinema/CinemaScene3DDemo.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuth from '../../../hooks/useAuth';
import useWebSocket from '../../../hooks/useWebSocket';
import { getChatHistory } from '../../../services/api';
import CinemaScene3D from './CinemaScene3D';
import Taskbar from '../../Taskbar';
import LeftSidebar from '../ui/LeftSidebar';
import MembersModal from '../../MembersModal';
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

export default function CinemaScene3DDemo() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation(); // 👈 get navigation state
  // === Derive host status ===
  const { isHost: isHostFromState = false, sessionId: sessionIdFromState } = location.state || {};
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get('session_id');
  const finalSessionId = sessionIdFromState || sessionIdFromUrl;
  const { currentUser, wsToken, loading: authLoading } = useAuth();
  const stableTokenRef = useRef(null);
  const [showSeatMarkers, setShowSeatMarkers] = useState(false);
  // === State ===
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sessionChatMessages, setSessionChatMessages] = useState([]);
  const [newSessionMessage, setNewSessionMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [isSeatedMode, setIsSeatedMode] = useState(false);
  const [userSeats, setUserSeats] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isHostBroadcasting, setIsHostBroadcasting] = useState(false);
  const chatEndRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const [isViewLocked, setIsViewLocked] = useState(true);   // ✅ ADD THIS
  const [lightsOn, setLightsOn] = useState(true);          // ✅ ADD THIS
  const [isSeatGridModalOpen, setIsSeatGridModalOpen] = useState(false);
  const [outgoingSwapRequest, setOutgoingSwapRequest] = useState(null); // { targetUserId, targetSeatId }
  //const currentUserSeatId = currentUser?.id ? userSeats[currentUser.id] : null;
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
    stableTokenRef.current
  );

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
    return () => disconnectLiveKit();
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
    if (currentUser && currentSeatKey && Object.keys(userSeats).length === 0) {
      // Only set if not already assigned (avoid overriding manual picks)
      setUserSeats(prev => {
        if (prev[currentUser.id]) return prev; // already set
        return { ...prev, [currentUser.id]: currentSeatKey };
      });
    }
  }, [currentUser, currentSeatKey, userSeats]);

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
        case 'chat_message':
          if (msg.data.session_id === sessionStatus.id) {
            setSessionChatMessages(prev => {
              const exists = prev.some(m => m.ID === msg.data.ID);
              return exists ? prev : [...prev, { ...msg.data, reactions: msg.data.reactions || [] }];
            });
          }
          break;
        case 'take_seat':
          if (msg.user_id && msg.seat_id) {
            setUserSeats(prev => ({
              ...prev,
              [msg.user_id]: msg.seat_id
            }));
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
          if (msg.user_seats) setUserSeats(msg.user_seats);
          break;
        case 'seat_update':
          if (msg.userId && msg.seat) {
            setUserSeats(prev => ({ ...prev, [msg.userId]: `${msg.seat.row}-${msg.seat.col}` }));
          }
          break;
        case 'session_status':
          if (Array.isArray(msg.data.members)) {
            const memberMap = new Map();
            msg.data.members.forEach(m => {
              const id = m.user_id || m.id;
              if (id && !memberMap.has(id)) {
                memberMap.set(id, {
                  id,
                  username: m.username || m.Username || m.name || `User${id}`,
                  user_role: m.user_role || 'viewer'
                });
              }
            });
            const deduplicated = Array.from(memberMap.values());
            setRoomMembers(prev => {
              const demoUsers = prev.filter(u => u.is_demo);
              return [...deduplicated, ...demoUsers];
            });
          }
          break;
        case 'user_audio_state':
          if (msg.userId === currentUser?.id) {
            setIsAudioActive(msg.isAudioActive);
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
    navigate(`/rooms/${roomId}`);
  };

  const handleToggleSeatedMode = () => {
    const newMode = !isSeatedMode;
    setIsSeatedMode(newMode);
    if (sendMessage) {
      sendMessage({ type: 'seating_mode_toggle', enabled: newMode });
    }
  };

  const toggleAudio = () => {
    const newState = !isAudioActive;
    setIsAudioActive(newState);
    if (sendMessage) {
      sendMessage({
        type: 'user_audio_state',
        userId: currentUser?.id,
        isAudioActive: newState
      });
    }
  };

  const openMembers = () => {
    setIsMembersModalOpen(true);
  };


  const handleSeatSelect = (seatId) => {
    if (!currentUser || !sendMessage) return;

    const occupantId = Object.keys(userSeats).find(userId => userSeats[userId] === seatId);
    const isOccupied = !!occupantId;
    const isMe = occupantId === String(currentUser.id);

    if (isMe) {
      setIsSeatGridModalOpen(false);
      setOutgoingSwapRequest(null);
      return;
    }

    if (isOccupied) {
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
      jumpToSeat(seatId);
      setUserSeats(prev => ({ ...prev, [currentUser.id]: seatId }));
      sendMessage({
        type: 'take_seat',
        seat_id: seatId,
        row: parseInt(seatId.split('-')[0]),
        col: parseInt(seatId.split('-')[1]),
        user_id: currentUser.id
      });
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
      {/* 3D Scene */}
      <CinemaScene3D
        useGLBModel="improved"
        authenticatedUserID={currentUser?.id}
        videoElement={videoRef.current}
        onAvatarClick={openProfile} // ✅ ADD THIS
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
        remoteParticipants={remoteParticipantsMap}
        onEmoteReceived={() => {}}
        onChatMessageReceived={() => {}}
        onEmoteSend={(emoteData) => {
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
        }}
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
        isSeatedMode={isSeatedMode}
        roomMembers={roomMembers} // ✅ pass full list
        toggleSeatedMode={handleToggleSeatedMode}
        openChat={() => setIsChatOpen(prev => !prev)}
        onMembersClick={openMembers}
        onShareRoom={() => alert('Share room')}
        onSeatsClick={() => {
          setIsSeatGridModalOpen(current => {
            const newOpenState = !current;
            if (!newOpenState) {
              setOutgoingSwapRequest(null);
            }
            return newOpenState;
          });
        }}
        seats={[]}
        isCameraOn={isCameraOn}
        toggleCamera={() => {}}
        onLeaveCall={handleLeaveCall}
        onEmoteSend={(emoteData) => {
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
        }}
        showEmotes={true}
        showSeatModeToggle={false}
        showVideoToggle={false}
        
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
              sessionChatMessages.map((msg) => (
                <div key={msg.ID} className="text-white text-sm group">
                  <div>
                    <span className="font-medium text-purple-300">{msg.Username}:</span>{' '}
                    <span>{msg.Message}</span>
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
              ))
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
          //isOpen={true}
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          members={roomMembers}
          onMemberClick={openProfile}
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
          onClose={() => {
            setIsProfileOpen(false);
            setSelectedUser(null);
          }}
          onMessage={() => startChat(selectedUser.id)}
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
        />
      )}
    </div> // 👈 Only one root element
  );
}