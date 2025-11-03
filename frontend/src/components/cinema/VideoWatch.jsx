
// src/components/cinema/VideoWatch.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useWebSocket from '../../hooks/useWebSocket';
import useAudioManager from '../useAudioManager';
import { getTemporaryMediaItemsForRoom, deleteSingleTemporaryMediaItem } from '../../services/api';
import { generatePosterFromVideoFile } from '../../utils/generatePoster'; // ✅ Import poster util
import apiClient from '../../services/api';
import { getRoom, getRoomMembers } from '../../services/api';

// UI Components
import SeatsModal from './ui/SeatsModal';
import LeftSidebar from './ui/LeftSidebar';
import VideoSidebar from './ui/VideoSidebar';
import SeatSwapNotification from './ui/SeatSwapNotification';
import Taskbar from '../Taskbar';
import CinemaVideoPlayer from './ui/CinemaVideoPlayer';
import CameraPreview from './ui/CameraPreview';
import VideoTiles from './ui/VideoTiles';
import CinemaSeatView from './ui/CinemaSeatView';
import ScrollableSeatGrid from './ui/ScrollableSeatGrid';
// Example import - adjust the path
import ShareModal from '../ShareModal'; // ✅ Import ShareModal component
import MembersModal from '../../components/MembersModal.jsx'; // ✅ Import MembersModal component

// Import sounds
import { playSeatSound, playMicOnSound, playMicOffSound } from '../../utils/audio';

// at the top of VideoWatch.jsx
export default function VideoWatch() {
  const location = useLocation();
  const [roomHostId, setRoomHostId] = useState(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  // ✅ CORRECT: Match :roomId from your route
  const { roomId } = useParams();

  // ✅ Auth comes AFTER top-level logic
  const { currentUser, wsToken, loading: authLoading } = useAuth();
  // ✅ Compute isHost AFTER currentUser is available
  const isHost = React.useMemo(() => {
    return currentUser?.id === roomHostId;
  }, [currentUser?.id, roomHostId]);
  console.log("🔍 DEBUG: roomHostId =", roomHostId, "currentUser.id =", currentUser?.id, "isHost =", isHost);
  
  console.log("[VideoWatch] roomId from URL:", roomId);
  if (!roomId) {
    console.error("❌ VideoWatch: roomId is missing from URL params!");
  }
  

  // 💬 WebSocket setup
  const { sendMessage, messages, isConnected, setBinaryMessageHandler, sessionStatus } = useWebSocket(roomId, authLoading ? null : wsToken);

  // Track commands
  const sendMessageRef = useRef();
  sendMessageRef.current = sendMessage;

  // Replace your current client_ready effects with this single one:

  useEffect(() => {
    if (isConnected && currentUser?.id) {
      console.log("🔍 [VideoWatch] WebSocket connected for user", currentUser.id);
      sendMessage({ type: 'client_ready' });
      console.log("🔍 [VideoWatch] Sent client_ready for user id", currentUser.id);
    }
  }, [isConnected]); // Only depend on isConnected
  
  useEffect(() => {
    console.log("🔍 [VideoWatch] sessionStatus updated:", sessionStatus);
    console.log("🔍 [VideoWatch] currentUser:", currentUser);
    console.log("🔍 [VideoWatch] Computed isHost:", sessionStatus?.hostId === currentUser?.id);
  }, [sessionStatus, currentUser]);
  // ✅ State for isHost
  //const [isHost, setIsHost] = useState(false);

  // ✅ WebSocket hook
  //const { sessionStatus, ...ws } = useWebSocket(roomId, wsToken);

  

  // Tracks whether *this tab* started the local screen share (getDisplayMedia)
  const [isLocalScreenShareHost, setIsLocalScreenShareHost] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);

  const navigate = useNavigate();

  
  
  // ref for player binary handler
  const handleBinaryMessageFromPlayerRef = useRef(null);
  
  // Track processed messages to avoid re-processing on every render
  const processedMessageCountRef = useRef(0);

  // Called by CinemaVideoPlayer to register/unregister its handler
  const setPlayerBinaryHandler = useCallback((handler) => {
    console.log("VideoWatch: setPlayerBinaryHandler called; isHost:", isHost, "handler:", !!handler);
    handleBinaryMessageFromPlayerRef.current = handler;

    // Only register the handler with WebSocket for viewers
    if (!isHost && typeof handler === 'function') {
      setBinaryMessageHandler(handler); // from useWebSocket hook
    } else {
      // Host or unregister: ensure the ws-level handler is cleared
      setBinaryMessageHandler(null);
    }
  }, [isHost, setBinaryMessageHandler]);

  // 🎥 Media State
  const [currentMedia, setCurrentMedia] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackPositionRef = useRef(0);
  const [activeTab, setActiveTab] = useState('media'); // 'media' | 'liveshare' | 'chat'
  //const isScreenShareStarting = useRef(false);

  // 🪑 Seat Management
  const [seats, setSeats] = useState([]);
  const [userSeats, setUserSeats] = useState({});
  //const [isHost, setIsHost] = useState(false);
  const [isSeatsModalOpen, setIsSeatsModalOpen] = useState(false);

  // Notification id
  const notificationIdRef = useRef(0);

  // Platforms
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

  const getPlatformById = (id) => PLATFORMS.find(p => p.id === id);

  // 🔔 Notifications System
  const [notifications, setNotifications] = useState([]);
  const [pendingSeatRequests, setPendingSeatRequests] = useState([]);

  // 🎚️ UI State
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isVideoSidebarOpen, setIsVideoSidebarOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isGlowing, setIsGlowing] = useState(false);

  // 🎥 WebRTC & Audio State

  const [isAudioActive, setIsAudioActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const screenStreamRef = useRef(null); // ✅ Ref for screen stream
  const micStreamRef = useRef(null); // ✅ Ref for mic stream
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
 

  
  // Track Selected Platforms
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [activePlatformShare, setActivePlatformShare] = useState(null);

  // 🪑 Seated Mode State
  const [isSeatedMode, setIsSeatedMode] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [cameraPreviewStream, setCameraPreviewStream] = useState(null);

  // Track mouse position for left sidebar
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // ✅ ADD THESE FOR ADAPTIVE SYNC
  const lastSyncTimeRef = useRef(Date.now());
  const playbackTimeAtLastSyncRef = useRef(0);

  // Track Screen Share state
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(false);
  const [screenSharerUserId, setScreenSharerUserId] = useState(null);
  // Camera & Video Tiles State
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Handle Share Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
 
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sessionChatMessages, setSessionChatMessages] = useState([]);
  const [newSessionMessage, setNewSessionMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Detect if this is an Instant Watch room (temporary)
  const urlParams = new URLSearchParams(window.location.search);
  const isInstantWatch = urlParams.get('instant') === 'true';

  // 🪑 State for Glance Mode and Edit Mode
  const [showCinemaSeatView, setShowCinemaSeatView] = useState(false);
  const [showSeatGrid, setShowSeatGrid] = useState(false);

  // BROADCAST TRACKING
  const [isHostBroadcasting, setIsHostBroadcasting] = useState(false);

  // Handle members list modal
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [screenShareUrl, setScreenShareUrl] = useState(null);

  const sidebarRef = useRef(null); // ✅ Define sidebarRef
  // Add a ref to store the handler function passed to CinemaVideoPlayer
  // This ref will hold the function that VideoWatch needs to call when it receives a binary chunk
  //const handleBinaryMessageFromPlayerRef = useRef(null);

  // Define stable callbacks for CinemaVideoPlayer props
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, [setIsPlaying]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handleError = useCallback((err) => {
    if (!currentMedia) return;
    console.error("🎬 CinemaVideoPlayer: Error:", err);
    alert("❌ Failed to play video.");
  }, [currentMedia]); // Add currentMedia if alert depends on it being present

  const handlePauseBroadcast = useCallback(() => {
    if (isHost && isConnected && currentMedia) {
      sendMessage({
        type: "playback_control",
        command: "pause",
        media_item_id: currentMedia.ID,
        file_path: currentMedia.file_path,
        original_name: currentMedia.original_name,
        seek_time: playbackPositionRef.current,
        timestamp: Date.now(),
        sender_id: currentUser.id,
      });
    }
  }, [isHost, isConnected, currentMedia, sendMessage]);
  

  // Close leftsidebar when mouse is outside the sidebar
  useEffect(() => {
    if (!isLeftSidebarOpen || !sidebarRef.current) return;

    const sidebarWidth = sidebarRef.current.offsetWidth;
    const isMouseInSidebar = mousePosition.x < sidebarWidth;
    const isScreenSharing = currentMedia?.type === 'screen';

    if (!isMouseInSidebar && !isScreenSharing) {
      onClose?.();
    }
  }, [mousePosition, isLeftSidebarOpen, currentMedia]);

  useEffect(() => {
    if (activeTab === 'liveshare') {
      enumerateDevices();
    }
  }, [activeTab]);

  

  // 🎥 Fetch Room Members (Essential for WebRTC)
  useEffect(() => {
    if (!roomId || !currentUser) return;
    const fetchRoomMembers = async () => {
      try {
        const response = await getRoomMembers(roomId);
        const members = Array.isArray(response) ? response : response?.members || [];
        console.log("👥 [VideoWatch] Fetched room members:", members);
        setRoomMembers(members);
        
        // ✅ FIX: Use user_id, not id
        const hostMember = members.find(m => m.user_role === 'host');
        console.log("👥 [VideoWatch] Host member found:", hostMember);
        if (hostMember) {
          setRoomHostId(hostMember.id); // ← CORRECT FIELD
          console.log("👑 [VideoWatch] Room host found:", hostMember.user_id);
        } else {
          console.warn("No room host found in members list");
        }
      } catch (err) {
        console.error("Failed to fetch room members:", err);
        setRoomMembers([]);
      }
    };
    fetchRoomMembers();
  }, [roomId, currentUser]); // Re-run if roomId or currentUser changes

  const enumerateDevices = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(track => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCameraDevices(videoDevices);

      if (videoDevices.length > 0 && !selectedCameraDeviceId) {
        setSelectedCameraDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error("❌ Camera permission denied:", err);
      setCameraDevices([]);
    }
  };

  // Handle Delete Media (host deletes item from playlist)
  const handleDeleteMedia = async (mediaItem) => {
    console.log("🗑️ [VideoWatch] handleDeleteMedia called for item:", mediaItem.ID);
    if (!mediaItem?.ID) {
      console.warn("⚠️ handleDeleteMedia called with invalid item (missing ID).");
      alert("❌ Error: Invalid media item selected for deletion.");
      return;
    }

    // Ensure file_path exists — critical for deletion
    const filePath = mediaItem.file_path || mediaItem.FilePath;
    if (!filePath) {
      console.warn("⚠️ Media item missing file_path:", mediaItem);
      alert("❌ This media item is missing its file path and cannot be deleted.");
      return;
    }

    // Normalize and enrich media item
    const normalizedMediaItem = {
      ...mediaItem,
      ID: mediaItem.ID,
      type: 'upload',
      file_path: filePath,
      original_name: mediaItem.original_name || mediaItem.OriginalName || 'Unknown Media',
    };

    try {
      // ✅ Delete from backend (which will broadcast via WebSocket)
      await deleteSingleTemporaryMediaItem(roomId, normalizedMediaItem.ID);
      console.log("✅ [VideoWatch] Media item deleted from backend:", normalizedMediaItem.ID);

      // ✅ Update local playlist state (optimistic update)
      setPlaylist(prev => prev.filter(item => item.ID !== normalizedMediaItem.ID));
      console.log("📋 [VideoWatch] Media item removed from local playlist:", normalizedMediaItem.ID);

      // ✅ Optional: Update currentMedia if the deleted item is currently playing
      if (currentMedia?.ID === normalizedMediaItem.ID) {
        console.log("⏹️ [VideoWatch] Deleted item was currently playing. Stopping playback.");
        setCurrentMedia(null);
        setIsPlaying(false);
        // Optionally, play the next item in the playlist
        // handlePlayNext();
      }

      // ✅ Optional: Update upcoming items if the deleted item was next
      // setUpcomingItems(prev => prev.filter(item => item.ID !== normalizedMediaItem.ID));
      // console.log("⏭️ [VideoWatch] Upcoming items updated after deletion.");

    } catch (err) {
      console.error("❌ [VideoWatch] Failed to delete media item:", normalizedMediaItem.ID, err);
      alert("❌ Failed to delete media item. Please try again.");
      // Optionally, refetch playlist to ensure consistency
      // fetchPlaylist();
    }
  };

  // Alias for clarity/convenience (if needed)
  const onDeleteMedia = handleDeleteMedia; // ✅ Alias for onDeleteMedia prop

  const handlePlatformSelect = (platform) => {
    setSelectedPlatform(platform.id);
    if (sendMessage && currentUser) {
      sendMessage({
        type: "platform_selected",
        data: {
          platform_id: platform.id,
          platform_name: platform.name,
          platform_url: platform.url,
          user_id: currentUser.id,
        }
      });
    }
    // Optionally, you can trigger screen sharing logic here if needed
  };
  


  // Handle Seat Click (e.g., open seat selection UI)
  const handleSeatsClick = () => {
    console.log("🪑 [VideoWatch] handleSeatsClick called.");
    // ✅ Example logic: Open the scrollable seat grid modal
    setShowSeatGrid(true);
    // Or toggle seated mode
    // setIsSeatedMode(prev => !prev);
    console.log("🎬 [VideoWatch] setShowSeatGrid(true) or setIsSeatedMode toggled.");
  };  
  // Handle Share Room (generate URL and show modal)
  const handleShareRoom = () => {
    console.log("🎯 [VideoWatch] handleShareRoom called.");
    if (!sessionStatus.id) {
      showNotification('Session not ready yet.', 'error');
      console.warn("⚠️ [VideoWatch] handleShareRoom: Session ID is missing.");
      return;
    }
    // ✅ Construct the correct share URL (adjust path if needed)
    const url = `${window.location.origin}/watch/${roomId}?session_id=${sessionStatus.id}`;
    console.log("🔗 [VideoWatch] Generated share URL:", url);
    // ✅ Update state to show the ShareModal with the URL
    setShareUrl(url);
    setShowShareModal(true);
    console.log("📬 [VideoWatch] ShareModal state updated (isOpen: true, URL set).");
  };

  // 🎯 Show Notification (enhanced for actions)
  const showNotification = useCallback((message, type = 'info', actions = null) => {
    const id = notificationIdRef.current++;
    setNotifications(prev => [...prev, { id, message, type, actions }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000); // longer for actions
  }, []);

  // Handle videowatch members
  // Auto-join room if not already a member
  useEffect(() => {
    if (!roomId || !currentUser) return;

    const joinRoomIfNeeded = async () => {
      try {
        // Check if user is already a member
        const members = await getRoomMembers(roomId);
        const memberList = Array.isArray(members) ? members : members?.members || [];
        const isMember = memberList.some(m => m.id === currentUser.id);
        
        if (!isMember) {
          console.log("User not in room — joining...");
          await apiClient.post(`/api/rooms/${roomId}/join`);
          // Optionally refetch members
          fetchRoomMembers();
        }
      } catch (err) {
        console.error("Failed to join room:", err);
        // If room is gone, redirect to lobby
        if (err.response?.status === 404) {
          navigate('/lobby');
        }
      }
    };

    joinRoomIfNeeded();
  }, [roomId, currentUser]);

  // 🔍 DEBUG: Periodic health check for screen share readiness
  useEffect(() => {
    if (!roomId || !currentUser?.id) return;

    const debugInterval = setInterval(() => {
      console.group(`🔍 [DEBUG] Screen Share Health Check - User ${currentUser.id} in Room ${roomId}`);
      
      // 1. WebSocket status
      console.log("🔌 WebSocket connected:", isConnected);
      
      // 2. Current media state
      console.log("📺 currentMedia.type:", currentMedia?.type);
      console.log("🎬 isHost:", isHost);
      
      // 3. Screen share state
      console.log("📡 isScreenSharingActive:", isScreenSharingActive);
      console.log("👤 screenSharerUserId:", screenSharerUserId);
      
      // 4. Viewer readiness
      const isViewer = !isHost && currentMedia?.type === 'screen_share';
      console.log("👁️ Is viewer (should receive stream):", isViewer);
      
      if (isViewer) {
        // Check if binary handler is registered
        const handlerRegistered = handleBinaryMessageFromPlayerRef.current !== null;
        console.log("✅ Binary handler registered:", handlerRegistered);
        
        // You can also check if viewer_ready was sent (add a ref if needed)
        // e.g., console.log("📤 viewer_ready sent:", viewerReadySentRef.current);
      }
      
      // 5. Room members (from last fetch)
      console.log("👥 Room members count:", roomMembers.length);
      const hostMember = roomMembers.find(m => m.user_role === 'host');
      console.log("👑 Room host ID:", hostMember?.id);
      
      console.groupEnd();
    }, 5000); // Log every 5 seconds

    return () => clearInterval(debugInterval);
  }, [roomId, currentUser?.id, isConnected, currentMedia?.type, isHost, isScreenSharingActive, screenSharerUserId, roomMembers]);

  // 🎬 Initialize Seats on Mount
  useEffect(() => {
    if (!currentUser) return;
    const newSeats = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        newSeats.push({ id: `${row}-${col}`, row, col, occupied: false, userId: null });
      }
    }
    setSeats(newSeats);
    // isHost is now set based on room data, not here
  }, [currentUser]);

  // ✅ TOP-LEVEL: Handle Play Media (Uploaded Files)
  const handlePlayMedia = (mediaItem) => {
  // Validate media item
  const id = mediaItem?.ID || mediaItem?.id || mediaItem?.media_item_id;
  if (!id) {
    console.warn("⏯️ VideoWatch: handlePlayMedia called with invalid item (missing ID).");
    alert("❌ Error: Invalid media item selected.");
    return;
  }

  // Ensure file_path exists — critical for playback
  const filePath = mediaItem.file_path || mediaItem.FilePath;
    if (!filePath) {
      console.warn("⚠️ Media item missing file_path:", mediaItem);
      alert("❌ This media item is missing its file path and cannot be played.");
      return;
    }

    // Normalize and enrich media item
    const normalizedMediaItem = {
      ...mediaItem,
      ID: id,
      type: 'upload',
      file_path: filePath,
      original_name: mediaItem.original_name || mediaItem.OriginalName || 'Unknown Media',
    };

    // ✅ Set locally (host)
    setCurrentMedia(normalizedMediaItem);
    setIsPlaying(true);
    playbackPositionRef.current = 0;

    // ✅ Broadcast to room (host-only)
    if (isHost && isConnected) {
      // Optional: verify item exists in playlist (defensive)
      const isInPlaylist = playlist.some(item => 
        (item.ID || item.id) == id
      );

      if (!isInPlaylist) {
        console.warn("⚠️ Playing media not in playlist:", id);
        // Still allow playback — maybe it was just added
      }

      const playCommand = {
        type: "playback_control",
        command: "play",
        media_item_id: id,
        seek_time: 0,
        timestamp: Date.now(),
        sender_id: currentUser.id,
      };
      sendMessage(playCommand);

      // Update room status for UI
      sendMessage({
        type: "update_room_status",
        data: {
          currently_playing: normalizedMediaItem.original_name,
          coming_next: '',
          is_screen_sharing: false,
          screen_sharing_user_id: 0,
        }
      });
    }
  };

  // Handle Broadcast toggle
  const handleHostBroadcastToggle = () => {
    setIsHostBroadcasting(prev => {
      const newState = !prev;
      sendMessage({ type: "host_broadcast_toggle" });
      return newState;
    });
  };

  // Handle Camera Toggle
  const toggleCamera = async () => {
    if (!isCameraOn) {
      // Request camera access
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setCameraPreviewStream(stream);
        setIsCameraOn(true);

        // Broadcast camera ON
        sendMessage({
          type: "camera_toggle",
          data: { is_camera_on: true }
        });
      } catch (err) {
        console.error("Camera access denied:", err);
        alert("Camera access required to share video.");
      }
    } else {
      // Turn off camera
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(track => track.stop());
      }
      setCameraPreviewStream(null);
      setIsCameraOn(false);

      // Broadcast camera OFF
      sendMessage({
        type: "camera_toggle",
        data: { is_camera_on: false }
      });
    }
  };

  // Handle AutoScroll in Chat
  const chatEndRef = useRef(null);
  // Handle Seating 
  useEffect(() => {
    if (isHost && !hasMicPermission) {
      requestMicPermission();
    }

    // Auto-assign seat if seating mode is ON and user has no seat
    if (isSeatedMode && currentUser && !userSeats[currentUser.id]) {
      // Find first available seat
      const allSeatIds = seats.map(s => `${s.row}-${s.col}`);
      const occupiedSeatIds = Object.values(userSeats);
      const availableSeat = allSeatIds.find(seatId => !occupiedSeatIds.includes(seatId));

      if (availableSeat) {
        handleSeatAssignment(availableSeat); // sends seat_update via WebSocket
        playSeatSound();
      }
    }
  }, [isSeatedMode, currentUser, userSeats, seats]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionChatMessages]);

  // Handle Chat Messaging
  const handleSendSessionMessage = async () => {
    if (!newSessionMessage.trim() || !sessionStatus.id || !sendMessage) return;

    const chatMessage = {
      type: "chat_message",
      data: { // ← wrap payload in "data"
        message: newSessionMessage.trim(),
        session_id: sessionStatus.id,
      }
    };

    sendMessage(chatMessage);
    setNewSessionMessage('');
  };

  // Autodirect members to the right session
  useEffect(() => {
    if (sessionStatus?.session_id && !window.location.search.includes('session_id')) {
      const url = new URL(window.location);
      url.searchParams.set('session_id', sessionStatus.session_id);
      window.history.replaceState({}, '', url);
    }
  }, [sessionStatus?.session_id]);
  
  // ✅ TOP-LEVEL: Handle Media Selection (for LeftSidebar)
  const handleMediaSelect = (media) => {
    console.log("🎬 [VideoWatch] handleMediaSelect called with:", media);
    if (!media) {
      console.warn("⚠️ handleMediaSelect called with null/undefined media");
      return;
    }

    if (media.type === 'upload') {
      handlePlayMedia(media);
    } else if (media.type === 'platform') {
      console.log("🌐 Platform selected:", media.title);
    } else if (media.type === 'screen_share') {
      // ✅ ADD THIS CHECK
      if (!isConnected) {
        console.warn("⚠️ [ScreenShare] WebSocket not connected yet. Waiting...");
        const start = Date.now();
        const interval = setInterval(() => {
          if (isConnected) {
            clearInterval(interval);
            console.log("✅ WebSocket connected, proceeding with screen share.");
            console.log("user websocket connected: user", currentUser?.id);
            handleMediaSelect(media); // Re-call with same media
          } else if (Date.now() - start > 2000) {
            clearInterval(interval);
            alert("Connection timed out. Please try again.");
          }
        }, 100);
        return;
      }

      if (media.stream) {
        console.log("🖥️ [HOST] Received screen stream from LeftSidebar, preparing broadcast.");
        console.log('[VideoWatch] handleMediaSelect: screen_share stream:', media.stream);
        console.log('[VideoWatch] handleMediaSelect: stream tracks:', media.stream.getTracks());

        // 👇 VALIDATE VIDEO TRACK EXISTS
        const videoTrack = media.stream.getVideoTracks()[0];
        if (!videoTrack) {
          alert("No video track in screen share stream! Please select a tab or window with video content.");
          handleMediaSelect({ type: 'end_screen_share' });
          return;
        }

        // ✅ Clean up any existing recorder
        if (mediaRecorderRef.current) {
          console.warn('[VideoWatch] handleMediaSelect: Stopping existing MediaRecorder:', mediaRecorderRef.current.state);
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
          console.log('[VideoWatch] handleMediaSelect: MediaRecorder stopped.');
          console.log('[VideoWatch] handleMediaSelect: Existing MediaRecorder cleaned up.');
        }

        // ✅ Set local stream for host preview
        setLocalScreenStream(media.stream);
        screenStreamRef.current = media.stream;
        setIsScreenSharingActive(true);
        console.log('[VideoWatch] Local screen stream set for host preview.');

        // ✅ Set currentMedia for UI
        setCurrentMedia({
          type: 'screen_share',
          userId: currentUser.id,
          stream: media.stream,
          title: media.title || 'Live Screen Share',
          original_name: media.original_name || 'Live Screen Share'
        });
        setIsPlaying(true);
        console.log('[VideoWatch] currentMedia set for screen share UI.');

        // ✅ ENFORCE WebM + VP8 — and validate support
        const mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          alert('Your browser does not support WebM screen sharing. Please use Chrome or Edge.');
          handleMediaSelect({ type: 'end_screen_share' });
          return;
        }
        console.log('[ScreenShare] Using mimeType:', mimeType);

        // ✅ 🚀 SEND START COMMAND IMMEDIATELY — BEFORE RECORDING
        console.log("[ScreenShare] 🚀 Sending screen_share 'start' command (early)");
        sendMessageRef.current({
          type: "screen_share",
          command: "start",
          room_id: Number(roomId),
          data: { mime_type: mimeType }
        });
        sendMessageRef.current({
          type: "update_room_status",
          data: {
            is_screen_sharing: true,
            screen_sharing_user_id: currentUser.id,
            currently_playing: media.title || 'Live Screen Share',
            coming_next: ''
          }
        });

        // ✅ Start recording — send binary chunks (including init segment) AFTER session is live
        const startRecording = () => {
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
          }

          const mediaRecorder = new MediaRecorder(media.stream, { mimeType });
          console.log('[VideoWatch] Created MediaRecorder with mimeType:', mimeType);

          let initSegmentSent = false;
          let bufferedChunks = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size === 0) return;

            // Buffer until we confirm WebM header (for reliable init segment)
            if (!initSegmentSent) {
              bufferedChunks.push(event.data);
              const totalSize = bufferedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
              console.log(`[ScreenShare] Buffered chunk (size: ${event.data.size}), total buffered size: ${totalSize}`);

              const totalBuffer = new Blob(bufferedChunks);
              const reader = new FileReader();
              reader.onload = () => {
                const bytes = new Uint8Array(reader.result.slice(0, 32));
                const hex = Array.from(bytes)
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join('');

                if (hex.startsWith('1a45dfa3')) {
                  console.log("[ScreenShare] ✅ Full WebM header detected across chunks");
                  const initBlob = new Blob(bufferedChunks, { type: 'video/webm' });
                  sendMessageRef.current(initBlob);
                  initSegmentSent = true;
                  bufferedChunks = [];
                } else if (totalSize > 50000 || bufferedChunks.length >= 5) {
                  // Fallback: send what we have
                  console.log("[ScreenShare] ⚠️ Sending init segment (fallback after 50KB or 5 chunks)");
                  const initBlob = new Blob(bufferedChunks, { type: 'video/webm' });
                  sendMessageRef.current(initBlob);
                  initSegmentSent = true;
                  bufferedChunks = [];
                }
              };
              reader.readAsArrayBuffer(totalBuffer);
              return;
            }

            // Send regular chunks
            console.log(`[ScreenShare] Sending binary chunk (size: ${event.data.size})`);
            sendMessageRef.current(event.data);
          };

          mediaRecorder.onerror = (err) => {
            console.error("🚨 MediaRecorder error:", err.error);
            alert("Screen sharing failed: " + (err.error?.message || err.error || 'Unknown error'));
            handleMediaSelect({ type: 'end_screen_share' });
          };

          mediaRecorder.start(100);
          mediaRecorderRef.current = mediaRecorder;
          console.log("[ScreenShare] MediaRecorder started.");
        };

        startRecording();

      } else {
        console.warn("⚠️ [HOST] 'screen_share' type received without stream.");
      }
    } else if (media.type === 'end_screen_share') {
      // ✅ Clear restart timeout (if any)
      if (screenStreamRef.current?.restartTimeout) {
        clearTimeout(screenStreamRef.current.restartTimeout);
        screenStreamRef.current.restartTimeout = null;
      }

      // ✅ Stop MediaRecorder
      if (mediaRecorderRef.current) {
        console.log("[ScreenShare] Stopping MediaRecorder.");
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }

      // ✅ Stop and clean up tracks
      if (screenStreamRef.current) {
        console.log("[ScreenShare] Stopping screen stream tracks.");
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }

      // ✅ Clear UI state
      setLocalScreenStream(null);
      setCurrentMedia(null);
      setIsPlaying(false);
      setIsScreenSharingActive(false);

      // ✅ Notify backend
      console.log("[ScreenShare] Sending 'stop' command to backend.");
      sendMessageRef.current({ type: "screen_share", command: "stop", room_id: Number(roomId) });
      sendMessageRef.current({
        type: "update_room_status",
        data: {
          is_screen_sharing: false,
          screen_sharing_user_id: 0,
          currently_playing: '',
        }
      });

      console.log("⏹️ Screen share ended");
    } else {
      console.warn("⚠️ Unknown media type:", media);
    }
  };

  

  // Clean up PeerConnections on unmount
  useEffect(() => {
    return () => {
      console.log("🧹 [VideoWatch] Cleaning up WebRTC connections on unmount.");
      
      
      // Stop screen stream
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      // Stop camera preview stream (existing cleanup)
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraPreviewStream]); // Add other dependencies if needed, but cameraPreviewStream cleanup is already there, so maybe just [] if no other deps are needed for this specific cleanup, or include the refs if they might change.

  // Or, more specifically tied to the refs:
  useEffect(() => {
    return () => {
      console.log("🧹 [VideoWatch] Cleaning up WebRTC connections on unmount.");
      
      
      // Stop screen stream ref
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
    };
  }, []); // Empty dependency array is fine here for unmount cleanup


  // ✅ TOP-LEVEL: Handle Seat Assignment
  const handleSeatAssignment = (seatId) => {
    if (!currentUser || !sendMessage) return;
    const [row, col] = seatId.split('-').map(Number);
    sendMessage({
      type: 'seat_update',
      userId: currentUser.id,
      seat: { row, col }
    });
    setUserSeats(prev => ({ ...prev, [currentUser.id]: seatId }));
  };

  

  // 🎬 Fetch Media + Generate Posters (WITH ERROR HANDLING)
  useEffect(() => {
    if (!roomId || !currentUser) return; // Only run if auth + room validated

    const fetchAndGeneratePosters = async () => {
      try {
        const mediaItems = await getTemporaryMediaItemsForRoom(roomId);
        
        if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
          setPlaylist([]);
          return;
        }

        // Deduplicate and normalize IDs
        const normalizedItems = mediaItems.map(item => ({
          ...item,
          ID: item.ID || item.id || Date.now() + Math.random(),
          _isTemporary: true
        }));

        // Generate posters for items missing them
        const updatedItems = await Promise.all(
          normalizedItems.map(async (item) => {
            if (
              item.poster_url &&
              item.poster_url !== '/icons/placeholder-poster.jpg'
            ) {
              return item;
            }
            try {
              const response = await fetch(`/${item.file_path}`)
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const videoBlob = await response.blob();
              const posterUrl = await generatePosterFromVideoFile(videoBlob);
              return { ...item, poster_url: posterUrl };
            } catch (err) {
              console.warn("Failed to generate poster for item:", item, err);
              return { ...item, poster_url: '/icons/placeholder-poster.jpg' };
            }
          })
        );

        setPlaylist(updatedItems);
      } catch (err) {
        console.error("Failed to fetch media items:", err);
        if (err.response?.status === 404) {
          // Room was deleted while we were loading → redirect
          alert("This session has ended.");
          navigate('/lobby');
          return;
        }
        // For other errors, show empty playlist
        setPlaylist([]);
      }
    };

    fetchAndGeneratePosters();
  }, [roomId, currentUser, navigate]);

  useEffect(() => {
    console.log("🔌 WebSocket connected:", isConnected);
  }, [isConnected]);

  useEffect(() => {
    console.log("localStream:", localStream);
    console.log("hasMicPermission:", hasMicPermission);
  }, [localStream, hasMicPermission]);

  useEffect(() => {
    if (isHost && !hasMicPermission) {
      requestMicPermission();
    }
  }, [isHost, hasMicPermission]);

  // 🎧 Handle ALL incoming WebSocket messages
  useEffect(() => {
    // Only process NEW messages (messages added since last effect run)
    const newMessages = messages.slice(processedMessageCountRef.current);
    if (newMessages.length === 0) return;
    
    console.log("📡 [GUEST] Processing", newMessages.length, "NEW WebSocket messages (total:", messages.length, ")");
    
    newMessages.forEach((message, i) => {
      const messageIndex = processedMessageCountRef.current + i + 1;
      console.log(`[DEBUG] Processing NEW message ${messageIndex}:`, message.type);
      console.log("📡 [VideoWatch] Incoming WebSocket message:", message.type, message);
      // Handle client_ready acknowledgment
      if (message.type === "client_ready_ack") {
        // Optionally refetch session state if needed
        return;
      }
      switch (message.type) {
        // === EXISTING MESSAGES ===
        case 'participant_join':
          setParticipants(prev => [...prev, {
            id: message.userId,
            name: message.username || `User${message.userId.slice(0, 4)}`,
            isSpeaking: false,
            isCameraOn: false,
            isMuted: true,
            row: null,
            col: null,
            stream: null
          }]);
          break;  
        
        // 🎥 Handle session status (sent on initial connection)
        case "session_status":
          console.log("[VideoWatch] Received session_status:", message.data);
          const data = message.data;
          console.log("Raw session_status data:", message.data);
          console.log("host_id:", message.data.host_id, "hostId:", message.data.hostId);

          // 1. ❌ REMOVE THIS LINE (causes crash):
          // if (data.session_id) {
          //   setSessionId(data.session_id);
          // }

          // 2. Update room members list
          if (Array.isArray(data.members)) {
            setRoomMembers(data.members);
          }

          // 3. Determine if current user is host (only if not explicitly passed)
          //if (typeof isHostProp === 'undefined' && currentUser?.id) {
          //  const computedIsHost = data.host_id === currentUser.id;
          //  setIsHost(computedIsHost);
         // }

          // 4. Handle pre-existing screen share
          if (data.is_screen_sharing && data.screen_share_host_id) {
            const sharerId = data.screen_share_host_id;
            const isSelf = sharerId === currentUser?.id;

            setCurrentMedia({
              type: 'screen_share',
              userId: sharerId,
              title: 'Live Screen Share',
              original_name: 'Live Screen Share'
            });
            setIsPlaying(true);
            setIsScreenSharingActive(true);
            setScreenSharerUserId(sharerId);

            if (isSelf) {
              // Host: prepare to reacquire stream (e.g., on focus)
              console.log("🖥️ [HOST] Reconnecting as screen share host");
            } else {
              // Viewer: binary handler will be set by CinemaVideoPlayer
              console.log("📺 [VIEWER] Joining screen share from user", sharerId);
            }
          } else if (currentMedia?.type === 'screen_share') {
            // Clean up if screen share ended
            setCurrentMedia(null);
            setIsPlaying(false);
            setIsScreenSharingActive(false);
            setScreenSharerUserId(null);
          }
          break;

        case "update_room_status":
          // Update currentMedia and other UI state based on broadcasted info
          if (message.data?.currently_playing && currentMedia?.type !== 'screen_share') { // <-- ADD CHECK
            setCurrentMedia(prev => ({
              ...prev,
              original_name: message.data.currently_playing,
              // CRITICAL: Use 'screen_share' for server broadcast, 'upload' for files, keep others as needed
              type: message.data.is_screen_sharing ? 'screen_share' : 'upload', // <-- CHANGE 'screen' to 'screen_share'
              // You may want to update file_path, etc. if available, but only for 'upload' type
              // file_path: message.data.is_screen_sharing ? null : message.data.file_path // Example
            }));
          } else if (message.data?.currently_playing && currentMedia?.type === 'screen_share') {
            // If screen sharing is active, this update might be about *what* is being shared (e.g., "Watching YouTube")
            // Update the name/title if it's different, but keep the type as 'screen_share'
            if (currentMedia.original_name !== message.data.currently_playing) {
                setCurrentMedia(prev => ({
                    ...prev,
                    original_name: message.data.currently_playing
                }));
            }
          }
          // Optionally update "coming next" and other non-media-specific state
          // setComingNext(message.data.coming_next); // Example
          break;
        
        case "screen_share_started":
          console.log("VideoWatch: 📡 [GUEST] Processing screen_share_started:", message, "Current User:", currentUser?.id);
          const sharerId = message.data?.user_id; // snake_case from backend
          if (currentUser && sharerId && sharerId !== currentUser.id) {
            console.log("VideoWatch: 📺 [Viewer] Screen share started by user", sharerId);
            
            // ✅ Set currentMedia to trigger CinemaVideoPlayer mount
            setCurrentMedia({
              type: 'screen_share',
              userId: sharerId,
              title: 'Live Screen Share',
              original_name: 'Live Screen Share',
              mime_type: message.data.mime_type,
            });
            
            setIsPlaying(true);
            setIsScreenSharingActive(true);
            setScreenSharerUserId(sharerId);
            
            // ✅ Join the screen share (so backend adds you to viewers)
            sendMessage({
              type: "screen_share",
              command: "join",
              room_id: Number(roomId) // snake_case to match Go's json:"room_id"
            });
            
            console.log("VideoWatch: 📡 [GUEST] Sent 'join' for screen share in room:", roomId);
          }
          break;
        case "screen_share":
          if (message.command === "joined") {
            console.log("VideoWatch: ✅ Screen share joined ack received:", message.data);
            // No UI/state change needed — binary handler is already registered via currentMedia.type = 'screen_share'
            // This is just confirmation that the viewer is subscribed and (if available) received the init segment.
          }
          // You can add other commands here later (e.g., "leave", "backpressure")
          break;
        case "temporary_media_item_deleted":
          setPlaylist(prev => prev.filter(item => item.ID !== message.data.id));
          break;
        case "playback_sync":
          // Ignore self messages
          if (message.sender_id === currentUser?.id) break;

          // Only sync if we're playing the same media
          if (
            currentMedia?.ID !== message.media_item_id ||
            !isPlaying
          ) break;

          const now = Date.now();
          const latency = now - message.timestamp; // e.g., 300ms
          const adjustedTime = message.seek_time + (latency / 1000); // +0.3s

          // Only seek if drift > 0.5s (avoid jitter)
          if (Math.abs(playbackPositionRef.current - adjustedTime) > 0.5) {
            playbackPositionRef.current = adjustedTime;
            console.log(`[Sync] Adjusted playback to ${adjustedTime}s (latency: ${latency}ms)`);
          }
          break;

        case "temporary_media_item_added":
          setPlaylist(prev => [...prev, message.data]);
          // ✅ Preload for instant playback
          if (!isHost) {
            const video = document.createElement('video');
            video.src = `/${message.data.file_path}`;
            video.preload = 'auto';
            video.muted = true; // required for autoplay
            video.playsInline = true;
            // Trigger load + attempt autoplay (muted is allowed)
            video.play().catch(() => {}); // ignore play error, but it helps buffer
          }
          break;
        case "playback_control":
          // Ignore messages sent by self
          if (message.sender_id && message.sender_id === currentUser?.id) {
            break;
          }
          if (message.file_path) {
            // Only update if the media or seek time actually changed
            const isSameMedia =
              currentMedia &&
              currentMedia.file_path === message.file_path &&
              Math.abs(playbackPositionRef.current - message.seek_time) < 0.5; // allow small drift

            if (!isSameMedia || isPlaying !== (message.command === "play")) {
              setCurrentMedia({
                ID: message.media_item_id,
                type: 'upload',
                file_path: message.file_path,
                original_name: message.original_name || 'Unknown Media',
              });
              const now = Date.now();
              const latency = now - message.timestamp;
              const adjustedTime = message.seek_time + (latency / 1000);
              playbackPositionRef.current = adjustedTime;
              setIsPlaying(message.command === "play");
              console.log("[VideoWatch] isPlaying set to", message.command === "play");
            }
          } else {
            console.warn("[VideoWatch] Playback control missing file_path", message);
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
          if (message.data.session_id === sessionStatus.id) {
            const chatMsg = { ...message.data, reactions: message.data.reactions || [] };
            setSessionChatMessages(prev => {
              const exists = prev.some(msg => msg.ID === chatMsg.ID);
              return exists ? prev : [...prev, chatMsg];
            });
          }
          break;

        case "reaction":
          if (message.data.session_id === sessionStatus.id) {
            setSessionChatMessages(prev =>
              prev.map(msg => {
                if (message.data.message_id && msg.ID !== message.data.message_id) return msg;
                const alreadyReacted = (msg.reactions || []).some(
                  r => r.user_id === message.data.user_id && r.emoji === message.data.emoji
                );
                if (alreadyReacted) return msg;
                return { ...msg, reactions: [...(msg.reactions || []), message.data] };
              })
            );
          }
          break;

        case "thumbnail_ready":
          setPlaylist(prev => prev.map(item =>
            item.ID === message.media_item_id ? { ...item, poster_url: message.poster_url } : item
          ));
          break;

        case 'participant_leave':
          setParticipants(prev => prev.filter(p => p.id !== message.userId));
          break;

        case 'seat_update':
          const { userId, seat } = message;
          setParticipants(prev => prev.map(p => p.id === userId ? { ...p, row: seat.row, col: seat.col } : p));
          setUserSeats(prev => ({ ...prev, [userId]: `${seat.row}-${seat.col}` }));
          break;

        case 'seating_sync':
          setUserSeats(message.seats || {});
          break;

        case 'user_speaking':
          setSpeakingUsers(prev => message.speaking 
            ? new Set([...prev, message.userId]) 
            : new Set([...prev].filter(id => id !== message.userId))
          );
          break;

        case "screen_share_stopped":
          const stoppedUserId = message.data?.user_id; // ← snake_case
          if (stoppedUserId && stoppedUserId !== currentUser?.id) {
            // Only clear if it's someone else's share (or always clear if you only allow one share)
            setCurrentMedia(null);
            setIsPlaying(false);
            setIsScreenSharingActive(false);
            setScreenSharerUserId(null);
          }
          break;
        case "platform_selected":
          // Only show UI to the user who sent it
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

        
            
  
        default:
          console.warn("[VideoWatch] Unknown WebSocket message type:", message.type, message);
      }
    });
    
    // Update processed message count after processing
    processedMessageCountRef.current = messages.length;
  }, [messages, sessionStatus.id, currentUser?.id]);
  // }, [messages, sessionStatus.id, currentUser?.id, currentMedia?.userId]);


  // Fetch session chat messages
  const fetchSessionChat = async (sid) => {
    if (!roomId) return;
    setIsChatLoading(true);
    try {
      // You'll need to update your API to accept ?session_id=...
      const response = await apiClient.get(`/api/rooms/${roomId}/chat/history?session_id=${sid}`);
      setSessionChatMessages(response.data.messages || []);
    } catch (err) {
      console.error("Failed to load session chat:", err);
    } finally {
      setIsChatLoading(false);
    }
  };


  // 🪑 Handle Seat Swap Request
  const handleSeatSwapRequest = useCallback((targetSeat) => {
    if (!currentUser) return;
    const request = {
      type: 'seat_swap_request',
      from: currentUser.id,
      to: targetSeat.userId,
      seatId: targetSeat.id,
      timestamp: Date.now()
    };
    sendMessage(request);
    showNotification(`Request sent to User${targetSeat.userId.slice(0, 4)}!`, 'info');
  }, [currentUser, sendMessage]);

  // Handle Reaction to Messages
  const handleReactToMessage = (messageId, emoji) => {
    if (!sessionStatus.id || !sendMessage) return;

    const reactionData = {
      type: "reaction",
      data: {
        emoji: emoji,
        session_id: sessionStatus.id,
        message_id: messageId,
      }
      
    };

    sendMessage(reactionData);
  };


  // 🎥 Handle Video End
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
        //setUpcomingItems(playlist.filter(item => item.ID !== currentMedia.ID).slice(0, 3));
        setIsPlaying(true);
      } else {
        setCurrentMedia(null);
        setIsPlaying(false);
        //setUpcomingItems([]);
      }
    };

  // 🚪 Handle Leave Room
  const handleLeaveRoom = () => {
    navigate(`/room/${roomId}`);
  };

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraPreviewStream]);

  // 🖱️ Mouse Move Handler for Taskbar
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

  // 🕒 Adaptive sync using recursive setTimeout (host-only)
  useEffect(() => {
    if (!isHost || !isPlaying || !currentMedia || !isConnected) return;
    // ✅ Skip sync for screen share
    if (currentMedia.type === 'screen') return;
    let syncIntervalMs = 500;
    let stableCount = 0;
    const maxStableCount = 5;
    const minInterval = 500;
    const maxInterval = 2000;

    const scheduleNextSync = () => {
      if (!isHost || !isPlaying || !currentMedia || !isConnected) return;

      // Send sync
      sendMessage({
        type: "playback_sync",
        media_item_id: currentMedia.ID,
        seek_time: playbackPositionRef.current,
        timestamp: Date.now(),
        sender_id: currentUser.id,
      });

      // Calculate drift since last sync
      const now = Date.now();
      const elapsedPlayback = playbackPositionRef.current - playbackTimeAtLastSyncRef.current;
      const elapsedReal = (now - lastSyncTimeRef.current) / 1000;
      const isStable = Math.abs(elapsedPlayback - elapsedReal) < 0.2;

      if (isStable) {
        stableCount++;
        if (stableCount >= maxStableCount && syncIntervalMs < maxInterval) {
          syncIntervalMs = Math.min(syncIntervalMs + 250, maxInterval);
          stableCount = 0;
        }
      } else {
        stableCount = 0;
        if (syncIntervalMs > minInterval) {
          syncIntervalMs = minInterval;
        }
      }

      // Update refs
      lastSyncTimeRef.current = now;
      playbackTimeAtLastSyncRef.current = playbackPositionRef.current;

      setTimeout(scheduleNextSync, syncIntervalMs);
    };

    // Initialize refs
    lastSyncTimeRef.current = Date.now();
    playbackTimeAtLastSyncRef.current = playbackPositionRef.current;

    setTimeout(scheduleNextSync, syncIntervalMs);

    // Cleanup not needed (setTimeout can't be canceled easily)
  }, [isHost, isPlaying, currentMedia, isConnected, currentUser?.id]);

  // Sidebar click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isLeftSidebarOpen && !e.target.closest('.left-sidebar')) {
        setIsLeftSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLeftSidebarOpen]);

  useEffect(() => {
    console.log("isAudioActive changed to:", isAudioActive);
  }, [isAudioActive]);

  useEffect(() => {
    if (localStream) {
      console.log("[VideoWatch] localStream updated:", localStream);
      console.log("[VideoWatch] localStream audio tracks:", localStream.getAudioTracks());
      if (localStream.getAudioTracks().length) {
        console.log("[VideoWatch] localStream audio track enabled:", localStream.getAudioTracks()[0].enabled);
      }
    }
  }, [localStream]);

  // ✅ Audio Manager Hook
  // ✅ CORRECTED useAudioManager call
  const {
    requestMicPermission,
    toggleAudio: rawToggleAudio,
    //startBroadcastingAudio,
    //stopBroadcastingAudio,
  } = useAudioManager({
    hasMicPermission,
    setHasMicPermission,
    isAudioActive,
    setIsAudioActive,
    localStream,
    setLocalStream,
    wsRef,
    wsConnected: isConnected,
    userSeats,
    authenticatedUserID: currentUser?.id,
    speakingUsers,
    setSpeakingUsers,
    isHost,
    isSeatedMode, // ← only once!
  });

  // Create wrapped toggle with sound
  const toggleAudio = () => {
    const wasActive = isAudioActive;
    rawToggleAudio(); // do the actual mic toggle
    // Play sound after state update
    setTimeout(() => {
      if (wasActive) {
        playMicOffSound();
      } else {
        playMicOnSound();
      }
    }, 0);
  };

  // Sync isAudioActive with actual track state whenever localStream changes
  useEffect(() => {
    if (localStream) {
      const tracks = localStream.getAudioTracks();
      if (tracks.length > 0) {
        const actualEnabled = tracks[0].enabled;
        if (actualEnabled !== isAudioActive) {
          setIsAudioActive(actualEnabled);
          console.log("[Sync] isAudioActive synced to track.enabled:", actualEnabled);
        }
      }
    }
  }, [localStream, isAudioActive, setIsAudioActive]);


  // 🧭 SHOW LOADER WHILE AUTH CHECKS RUN
  if (authLoading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading your cinema experience...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Top-Left Menu Icon */}
      <div className="absolute top-0 left-0 p-4 z-50">
        <button
          onClick={() => setIsLeftSidebarOpen(prev => !prev)}
          className="h-6 w-6"
          aria-label={isLeftSidebarOpen ? "Close menu" : "Open menu"}
        >
          <img 
            src="/icons/MenuIcon.svg" 
            alt="Menu" 
            className={`h-6 w-6 transition-transform duration-300 ${isLeftSidebarOpen ? 'rotate-90' : ''}`}
          />
        </button>
      </div>

      {/* 📺 Main Video Player */}
      <CinemaVideoPlayer
        mediaItem={currentMedia}
        isPlaying={isPlaying}
        src={screenShareUrl}
        isHost={isHost}
        localScreenStream={localScreenStream}
        playbackPositionRef={playbackPositionRef}
        onPlay={handlePlay} // Use the stable callback
        onPause={handlePause} // Use the stable callback
        onEnded={handleVideoEnd}
        onError={handleError}
        onPauseBroadcast={handlePauseBroadcast}
        onBinaryHandlerReady={setPlayerBinaryHandler}
        onScreenShareReady={() => {
          console.log("[DEBUG] 🟢 Viewer READY — sending viewer_ready");
          if (!isHost && isConnected && sendMessage && currentMedia?.type === 'screen_share') {
            console.log("[VideoWatch] 📡 Sending viewer_ready signal");
            sendMessage({
              type: "screen_share",
              command: "viewer_ready",
              room_id: Number(roomId)
            });
            console.log("[VideoWatch] 📡 viewer_ready sent")
          }
        }}
      />

      {/* 🎚️ Hover Taskbar */}
    {!showSeatGrid && (   
      <Taskbar 
        authenticatedUserID={currentUser?.id}
        isAudioActive={isAudioActive}
        toggleAudio={toggleAudio}
        isVisible={isVisible}
        isGlowing={isGlowing}
        onShareRoom={handleShareRoom}
        setIsGlowing={setIsGlowing}
        onLeaveRoom={handleLeaveRoom}
        openVideoSidebar={() => setIsVideoSidebarOpen(prev => !prev)}
        isVideoSidebarOpen={isVideoSidebarOpen}
        isHost={isHost}
        isHostBroadcasting={isHost ? isHostBroadcasting : undefined}
        onHostBroadcastToggle={isHost ? () => setIsHostBroadcasting(prev => !prev) : undefined}
        isCameraOn={isCameraOn}
        toggleCamera={toggleCamera}
        openChat={() => setIsChatOpen(prev => !prev)}
        isSeatedMode={isSeatedMode}
        toggleSeatedMode={() => setIsSeatedMode(prev => !prev)}
        onSeatsClick={handleSeatsClick}  // ✅ only this is needed
        isMobile={false}
        seats={seats}
        userSeats={userSeats}
        currentUser={currentUser}
       // onLeaveCall={handleLeaveCall}
        onMembersClick={() => { fetchRoomMembers(); setShowMembersModal(true);}}
      />
    )}

    {/* Scrollable grid appears INSTEAD of taskbar */}
    {showSeatGrid && (
      <ScrollableSeatGrid
        seats={seats}
        userSeats={userSeats}
        currentUserID={currentUser?.id}
        onClose={() => setShowSeatGrid(false)}
        onSeatClick={handleSeatSwapRequest}
      />
    )}

      {/* 🪑 Seats Modal */}
      {isSeatsModalOpen && (
        <SeatsModal 
          seats={seats}
          userSeats={userSeats}
          currentUser={currentUser}
          onClose={() => setIsSeatsModalOpen(false)}
          onSwapRequest={handleSeatSwapRequest}
        />
      )}

      {/* 📂 Left Sidebar */}
      {isLeftSidebarOpen && (
        <div className="left-sidebar" onClick={e => e.stopPropagation()}>
          <LeftSidebar
            roomId={roomId}
            mousePosition={mousePosition}
            isLeftSidebarOpen={isLeftSidebarOpen}
            isScreenSharingActive={isScreenSharingActive}
            onEndScreenShare={() => handleMediaSelect({ type: 'end_screen_share' })}
            isConnected={isConnected}
            playlist={playlist}
            currentUser={currentUser}
            sendMessage={sendMessage}
            onDeleteMedia={onDeleteMedia}
            onMediaSelect={handleMediaSelect}
            onCameraPreview={setCameraPreviewStream}
            isHost={isHost}
            onClose={() => setIsLeftSidebarOpen(false)}
          />
        </div>
      )}

      {/* Platform Preview Panel — outside LeftSidebar */}
      {selectedPlatform && (
        <div 
          className="fixed left-80 top-1/2 transform -translate-y-1/2 w-80 z-40"
          style={{ maxWidth: 'calc(100vw - 240px)' }}
        >
          <div className="bg-gray-800/90 p-4 rounded-lg border border-gray-700">
            <h4 className="font-medium text-white mb-2">Selected: {selectedPlatform.name}</h4>
            <p className="text-gray-300 text-sm mb-3">
              Start screen sharing to watch {selectedPlatform.name} together.
            </p>
            <button
              onClick={() => {
                const url = selectedPlatform?.url; // now safe
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

      {/* 📹 Video Sidebar */}
      {isVideoSidebarOpen && (
        <VideoSidebar 
          participants={participants}
          localStream={localStream} 
        />
      )}

      {/* 🪑 Floating Notifications */}
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
          className="fixed bottom-24 right-4 w-80 bg-black/80 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl z-50 animate-fade-in"
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

      {/* ✅ Camera Preview */}
      <CameraPreview stream={cameraPreviewStream} />

      {/* Floating Video Tiles with speaking indicator */}
      <VideoTiles 
        participants={participants} 
        userSeat={userSeats[currentUser?.id]} 
        isSeatedMode={isSeatedMode}
        localStream={cameraPreviewStream}
        currentUser={currentUser}
        speakingUsers={speakingUsers}
      />


      {/* 🎬 CINEMA SEAT VIEW (BOTTOM OVERLAY) */}
      {showCinemaSeatView && (
        <CinemaSeatView onClose={() => setShowCinemaSeatView(false)} />
      )}

      {/* 🪑 SCROLLABLE SEAT GRID (TASKBAR OVERLAY) */}
      {showSeatGrid && (
        <ScrollableSeatGrid
          seats={seats}
          userSeats={userSeats}
          currentUserID={currentUser?.id}
          onClose={() => setShowSeatGrid(false)}
          onSeatClick={(seat) => {
            if (seat.userId !== currentUser?.id) {
              handleSeatSwapRequest(seat);
            }
          }}
          speakingUsers={speakingUsers}
        />
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
      />
    </div>
  );
};