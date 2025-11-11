// src/components/cinema/VideoWatch.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';
import useWebSocket from '../../hooks/useWebSocket';
import { getTemporaryMediaItemsForRoom, deleteSingleTemporaryMediaItem, getChatHistory } from '../../services/api';
import apiClient from '../../services/api';
import { getRoom, getRoomMembers } from '../../services/api';
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
// Import sounds
import { playSeatSound, playMicOnSound, playMicOffSound } from '../../utils/audio';

export default function VideoWatch() {
  const componentIdRef = useRef(`VideoWatch-${Date.now()}`);
  useEffect(() => {
    console.log(`🏁🏁🏁 [${componentIdRef.current}] COMPONENT MOUNTED`);
    return () => {
      console.log(`💀💀💀 [${componentIdRef.current}] COMPONENT UNMOUNTED`);
    };
  }, []);

  const location = useLocation();
  const [roomHostId, setRoomHostId] = useState(null);
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { currentUser, wsToken, loading: authLoading } = useAuth();
  

  const stableTokenRef = useRef(null);
  if (!authLoading && wsToken && !stableTokenRef.current) {
    stableTokenRef.current = wsToken;
  }

  const { sendMessage, messages, isConnected, sessionStatus, setBinaryMessageHandler } = useWebSocket(
    roomId,
    stableTokenRef.current
  );

  // ✅ LIVEKIT INTEGRATION
  const {
    room,
    localParticipant,
    remoteParticipants,
    isLiveKitConnected,
    connect: connectLiveKit,
    disconnect: disconnectLiveKit
  } = useLiveKitRoom(roomId, currentUser);

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
  const [isSeatedMode, setIsSeatedMode] = useState(false);
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
  const urlParams = new URLSearchParams(window.location.search);
  const isInstantWatch = urlParams.get('instant') === 'true';
  const [showCinemaSeatView, setShowCinemaSeatView] = useState(false);
  const [isHostBroadcasting, setIsHostBroadcasting] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [screenShareUrl, setScreenShareUrl] = useState(null);
  const sidebarRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const chatEndRef = useRef(null);
  const [localScreenTrack, setLocalScreenTrack] = useState(null);
  
  // 🎤 Audio device management
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(null);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const publishedAudioTrackRef = useRef(null);

  // ✅ Track active session ID for ending sessions
  const [activeSessionId, setActiveSessionId] = useState(null);

  // 🪑 Seat swap notifications
  const [seatSwapRequest, setSeatSwapRequest] = useState(null);

  useEffect(() => {
    if (roomId && currentUser) {
      connectLiveKit();
    }
  }, [roomId, currentUser?.id]);

  // ✅ Listen for remote participant track events
  useEffect(() => {
    if (!room) return;

    const handleTrackSubscribed = (track, publication, participant) => {
      console.log('📥 [VideoWatch] Remote track subscribed:', {
        participant: participant.identity,
        source: publication.source,
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted
      });
      // Audio handling is done by RemoteAudioPlayer component
    };

    const handleTrackUnsubscribed = (track, publication, participant) => {
      console.log('📤 [VideoWatch] Remote track unsubscribed:', {
        participant: participant.identity,
        source: publication.source
      });
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    };
  }, [room]);

  // 🎤 Enumerate audio devices on mount
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        setAudioDevices(audioInputs);
        
        // Set default device if none selected
        if (!selectedAudioDeviceId && audioInputs.length > 0) {
          // Prefer non-default devices (avoid "Default" which browser auto-switches)
          const preferredDevice = audioInputs.find(d => !d.label.toLowerCase().includes('default')) || audioInputs[0];
          setSelectedAudioDeviceId(preferredDevice.deviceId);
        }
        
        console.log('🎤 [VideoWatch] Available audio devices:', audioInputs.map(d => ({ label: d.label, id: d.deviceId })));
      } catch (err) {
        console.error('❌ [VideoWatch] Failed to enumerate devices:', err);
      }
    };

    enumerateDevices();
    
    // Listen for device changes (e.g., headset plugged in)
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
  }, []);

  useEffect(() => {
    return () => {
      if (localParticipant) {
        localParticipant.setScreenShareEnabled(false);
      }
      disconnectLiveKit();
    };
  }, []);

  // 🎤 Request microphone permission on mount (start muted)
  useEffect(() => {
    if (!localParticipant || hasMicPermission) return;

    const requestMic = async () => {
      try {
        console.log('🎤 [VideoWatch] Requesting microphone permission...');
        
        // Request mic but keep it disabled initially
        await localParticipant.setMicrophoneEnabled(false);
        
        setHasMicPermission(true);
        setIsAudioActive(false); // Start muted
        
        console.log('✅ [VideoWatch] Microphone permission granted (muted by default)');
      } catch (err) {
        console.error('❌ [VideoWatch] Microphone permission denied:', err);
        setHasMicPermission(false);
      }
    };

    requestMic();
  }, [localParticipant, hasMicPermission]);

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

  const isHost = React.useMemo(() => {
    return currentUser?.id === roomHostId;
  }, [currentUser?.id, roomHostId]);

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
      console.log('📡 [VideoWatch] Track published:', publication.source, publication.kind);
      console.log('   Publication track:', !!publication.track);
      console.log('   Publication trackSid:', publication.trackSid);
      
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
        const members = await getRoomMembers(roomId);
        const memberList = Array.isArray(members) ? members : members?.members || [];
        const isMember = memberList.some(m => m.id === currentUser.id);
        if (!isMember) {
          await apiClient.post(`/api/rooms/${roomId}/join`);
        }
        
        // ✅ Populate participants state with all room members
        const participantsList = memberList.map(member => ({
          id: member.id,
          name: member.username || `User${String(member.id).slice(0, 4)}`,
          isSpeaking: false,
          isCameraOn: false,
          isMuted: true,
          row: null,
          col: null,
          stream: null
        }));
        setParticipants(participantsList);
        console.log('👥 [VideoWatch] Initialized participants from room members:', participantsList);

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
    if (!roomId || !sessionStatus?.id) return;
    
    const loadChatHistory = async () => {
      setIsChatLoading(true);
      try {
        console.log('💬 [VideoWatch] Loading chat history for session:', sessionStatus.id);
        const response = await getChatHistory(roomId, sessionStatus.id);
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
  }, [roomId, sessionStatus?.id]);

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
    if (isHost && isConnected) {
      sendMessage({
        type: "playback_control",
        command: "play",
        media_item_id: id,
        file_path: filePath,
        file_url: normalizedMediaItem.mediaUrl, // ✅ add this
        original_name: normalizedMediaItem.original_name,
        seek_time: 0,
        timestamp: Date.now(),
        sender_id: currentUser.id,
      });
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

  // ✅ LIVEKIT SCREEN SHARE HANDLERS
  const handleStartScreenShare = async () => {
    console.log('🎬 [VideoWatch] handleStartScreenShare called');
    console.log('   localParticipant:', !!localParticipant);
    console.log('   isLiveKitConnected:', isLiveKitConnected);
    
    if (!localParticipant) {
      alert('LiveKit not ready');
      return;
    }
    try {
      console.log('📹 [VideoWatch] Calling setScreenShareEnabled(true)...');
      
      // Enable screen share with system audio - using captureOptions
      const captureOptions = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: true,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include'
      };
      
      console.log('🎵 [VideoWatch] Requesting screen share with audio options:', captureOptions);
      await localParticipant.setScreenShareEnabled(true, captureOptions);
      console.log('✅ [VideoWatch] Screen share enabled successfully');
      
      // Check if audio track was published
      setTimeout(() => {
        const audioTrackPubs = localParticipant.audioTrackPublications || new Map();
        const videoTrackPubs = localParticipant.videoTrackPublications || new Map();
        console.log('🎤 [VideoWatch] Audio tracks after screen share:', audioTrackPubs.size);
        console.log('📹 [VideoWatch] Video tracks after screen share:', videoTrackPubs.size);
        
        Array.from(audioTrackPubs.values()).forEach(pub => {
          console.log('   Audio track:', { 
            source: pub.source, 
            kind: pub.kind, 
            trackSid: pub.trackSid,
            enabled: pub.track?.enabled,
            muted: pub.track?.muted 
          });
        });
        
        Array.from(videoTrackPubs.values()).forEach(pub => {
          console.log('   Video track:', { 
            source: pub.source, 
            kind: pub.kind,
            trackSid: pub.trackSid
          });
        });
      }, 1000);
      
      // Manually check for the track (use videoTrackPublications)
      const trackPubs = localParticipant.videoTrackPublications || localParticipant.videoTracks;
      if (trackPubs && trackPubs.size > 0) {
        const screenSharePub = Array.from(trackPubs.values()).find(
          pub => pub.source === Track.Source.ScreenShare
        );
        if (screenSharePub?.track) {
          console.log('🎯 [VideoWatch] Manually found screen share track after enabling');
          setLocalScreenTrack(screenSharePub.track);
        } else {
          console.warn('⚠️ [VideoWatch] No screen share track found immediately after enabling');
        }
      } else {
        console.log('⏳ [VideoWatch] videoTrackPublications not populated yet, waiting for TrackPublished event');
      }
      
      setIsScreenSharingActive(true);
      sendMessage({
        type: "update_room_status",
        data: {
          is_screen_sharing: true,
          screen_sharing_user_id: currentUser.id,
          currently_playing: "Live Screen Share",
          coming_next: ""
        }
      });
    } catch (err) {
      console.error("❌ [VideoWatch] Screen share error:", err);
      alert("Failed to start screen share: " + err.message);
    }
  };

  const handleEndScreenShare = () => {
    if (localParticipant) {
      localParticipant.setScreenShareEnabled(false);
    }
    setIsScreenSharingActive(false);
    sendMessage({
      type: "update_room_status",
      data: {
        is_screen_sharing: false,
        screen_sharing_user_id: 0,
        currently_playing: "",
      }
    });
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
    const newMessages = messages.slice(processedMessageCountRef.current);
    if (newMessages.length === 0) return;

    newMessages.forEach((message) => {
      switch (message.type) {
        case "session_status":
          const data = message.data;

          // ✅ Normalize and deduplicate members
          if (Array.isArray(data.members)) {
            const memberMap = new Map();
            data.members.forEach(member => {
              const id = member.user_id || member.id;
              if (!id) return; // skip invalid

              // Prefer richer data if already present, otherwise use this entry
              if (!memberMap.has(id)) {
                memberMap.set(id, {
                  id,
                  Username: member.Username || member.username || 'Anonymous',
                  user_role: member.user_role || 'viewer',
                  // Add other fields you need (e.g., avatar, etc.)
                });
              }
            });
            setRoomMembers(Array.from(memberMap.values()));
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
          if (message.sender_id && message.sender_id === currentUser?.id) break;
          if (message.file_path) {
            const isSameMedia = currentMedia && currentMedia.file_path === message.file_path;
            if (!isSameMedia || isPlaying !== (message.command === "play")) {
              // ✅ Construct full URL for uploaded media
              const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
              const fileUrl = message.file_url || message.file_path;
              const mediaUrl = fileUrl.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
              
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
              playbackPositionRef.current = adjustedTime;
              setIsPlaying(message.command === "play");
            }
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
          
          // Don't update state for our own messages (already handled locally)
          if (audioUserId === currentUser?.id) break;
          
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
          
          // ✅ Show toast notification
          toast('Videowatch session ended', {
            icon: 'ℹ️',
            duration: 3000,
          });
          
          // Perform cleanup and navigate
          performCleanupAndExit();
          break;

        default:
          console.warn("[VideoWatch] Unknown WebSocket message type:", message.type, message);
      }
    });
    processedMessageCountRef.current = messages.length;
  }, [messages, sessionStatus.id, currentUser?.id, currentMedia]);

  // Handle Chat
  const handleSendSessionMessage = async () => {
    if (!newSessionMessage.trim() || !sessionStatus.id || !sendMessage) return;
    const chatMessage = {
      type: "chat_message",
      data: { 
        message: newSessionMessage.trim(), 
        session_id: sessionStatus.id,
        user_id: currentUser?.id,
        username: currentUser?.username || `User${currentUser?.id}`
      },
    };
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
    // Check if current user is the host
    const isHost = currentUser?.id === roomHostId;

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
        if (activeSessionId) {
          console.log('🛑 Host ending session:', activeSessionId);
          await apiClient.post(`/api/rooms/watch-sessions/${activeSessionId}/end`);
          console.log('✅ Session ended successfully');
        }
      } catch (error) {
        console.error('❌ Failed to end session:', error);
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

    // 5. Navigate back to RoomPage
    console.log('🏠 Navigating to RoomPage...');
    navigate(`/rooms/${roomId}`); // ✅ FIXED: /rooms/ not /room/
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

  useEffect(() => {
    if (!roomId || !currentUser) return;
    fetchRoomMembers();
  }, [roomId, currentUser, fetchRoomMembers]);

  // 🎤 Publish microphone with specific device
  const publishMicDevice = useCallback(async (deviceId) => {
    if (!localParticipant) {
      console.warn('⚠️ [VideoWatch] No localParticipant for mic publish');
      return false;
    }
    try {
      console.log(`🎤 [VideoWatch] Publishing mic device: ${deviceId}`);
      // Stop and unpublish old track if exists
      if (publishedAudioTrackRef.current) {
        try {
          await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
          publishedAudioTrackRef.current.stop();
        } catch (err) {
          console.warn('⚠️ [VideoWatch] Failed to unpublish old track:', err);
        }
        publishedAudioTrackRef.current = null;
      }

      // ✅ FIX: Use minimal audio constraints for voice clarity
      const constraints = {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,      // Keep this (helps with feedback)
        noiseSuppression: false,     // ← DISABLE
        autoGainControl: false,      // ← DISABLE
      };

      console.log('🎤 [VideoWatch] Creating audio track with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      const audioTrack = stream.getAudioTracks()[0];
      console.log(`🎤 [VideoWatch] Got audio track: ${audioTrack.label}`);

      // Publish to LiveKit
      await localParticipant.publishTrack(audioTrack);
      publishedAudioTrackRef.current = audioTrack;
      console.log('✅ [VideoWatch] Microphone published successfully');
      playMicOnSound();
      return true;
    } catch (err) {
      console.error('❌ [VideoWatch] Failed to publish microphone:', err);
      publishedAudioTrackRef.current = null;
      return false;
    }
  }, [localParticipant]);

  // 🎤 Unpublish microphone
  const unpublishMic = useCallback(async () => {
    if (!localParticipant) return;

    try {
      console.log('🎤 [VideoWatch] Unpublishing microphone');
      
      if (publishedAudioTrackRef.current) {
        await localParticipant.unpublishTrack(publishedAudioTrackRef.current);
        publishedAudioTrackRef.current.stop();
        publishedAudioTrackRef.current = null;
      }
      
      console.log('✅ [VideoWatch] Microphone unpublished');
      playMicOffSound();
    } catch (err) {
      console.error('❌ [VideoWatch] Failed to unpublish microphone:', err);
    }
  }, [localParticipant]);

  // ✅ Audio toggle function with device-specific publishing
  const toggleAudio = useCallback(async () => {
    const newAudioState = !isAudioActive;

    // 🎙️ Toggle LiveKit microphone with selected device
    let success = false;
    if (newAudioState) {
      // Enable: publish the selected device
      success = await publishMicDevice(selectedAudioDeviceId);
      if (!success) {
        // Failed to publish, revert state
        return;
      }
    } else {
      // Disable: unpublish mic
      await unpublishMic();
      success = true;
    }

    if (success) {
      setIsAudioActive(newAudioState);
      
      // Extract current user's row from userSeats
      const currentUserSeatId = userSeats[currentUser?.id];
      const currentUserRow = currentUserSeatId ? parseInt(currentUserSeatId.split('-')[0]) : null;

      // 📡 Send real-time update over WebSocket for UI state sync
      sendMessage({
        type: "user_audio_state",
        isAudioActive: newAudioState,
        userId: currentUser.id,
        isSeatedMode: isSeatedMode,
        isGlobalBroadcast: isHost && isSeatedMode && isHostBroadcasting,
        row: isSeatedMode && currentUserRow !== null ? currentUserRow : null,
      });
    }
  }, [isAudioActive, selectedAudioDeviceId, publishMicDevice, unpublishMic, currentUser?.id, isSeatedMode, isHost, isHostBroadcasting, userSeats, sendMessage]);

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

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* ✅ Toast Notifications */}
      <Toaster position="top-center" />
      
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

      {/* 📺 Main Video Player — PASS LIVEKIT TRACK */}
      <CinemaVideoPlayer
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
        // ❌ REMOVED: onBinaryHandlerReady, onScreenShareReady (not needed with LiveKit)
      />
      
      {/* 🔊 Remote Audio Player - Handles audio from screen share */}
      {room && <RemoteAudioPlayer room={room} />}

      {/* Rest of UI (Taskbar, Sidebar, Chat, etc.) — UNCHANGED */}
      <Taskbar 
          authenticatedUserID={currentUser?.id}
          isAudioActive={isAudioActive}
          toggleAudio={toggleAudio}
          isVisible={isVisible}
          isGlowing={isGlowing}
          onShareRoom={handleShareRoom}
          setIsGlowing={setIsGlowing}
          onLeaveCall={handleLeaveRoom}
          openVideoSidebar={() => setIsVideoSidebarOpen(prev => !prev)}
          isVideoSidebarOpen={isVideoSidebarOpen}
          isHost={isHost}
          isHostBroadcasting={isHost ? isHostBroadcasting : undefined}
          onHostBroadcastToggle={isHost ? () => setIsHostBroadcasting(prev => !prev) : undefined}
          isCameraOn={isCameraOn}
          toggleCamera={toggleCamera}
          openChat={() => setIsChatOpen(prev => !prev)}
          isSeatedMode={isSeatedMode}
          toggleSeatedMode={() => {
            const newMode = !isSeatedMode;
            console.log('🪑 [toggleSeatedMode] Toggling seating mode:', { from: isSeatedMode, to: newMode });
            setIsSeatedMode(newMode);
            console.log('🪑 [toggleSeatedMode] Sending seating_mode_toggle message:', { enabled: newMode });
            sendMessage({
              type: 'seating_mode_toggle',
              enabled: newMode
            });
          }}
          onSeatsClick={handleSeatsClick}
          seats={seats}
          userSeats={userSeats}
          currentUser={currentUser}
          onMembersClick={() => { fetchRoomMembers(); setShowMembersModal(true);}}
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
            isScreenSharingActive={isScreenSharingActive}
            onStartScreenShare={handleStartScreenShare}
            onEndScreenShare={handleEndScreenShare}
            isConnected={isConnected}
            playlist={playlist}
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
      />
    </div>
  );
}