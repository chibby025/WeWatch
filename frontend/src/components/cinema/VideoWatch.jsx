// src/components/cinema/VideoWatch.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useWebSocket from '../../hooks/useWebSocket';
import useAudioManager from '../useAudioManager';
import { getTemporaryMediaItemsForRoom, deleteSingleTemporaryMediaItem } from '../../services/api';
import { generatePosterFromVideoFile } from '../../utils/generatePoster';
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

  const { sendMessage, messages, isConnected, sessionStatus } = useWebSocket(
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

  useEffect(() => {
    return () => {
      if (localParticipant) {
        localParticipant.setScreenShareEnabled(false);
      }
      disconnectLiveKit();
    };
  }, []);

  const isHost = React.useMemo(() => {
    return currentUser?.id === roomHostId;
  }, [currentUser?.id, roomHostId]);

  // Camera toggle
  const toggleCamera = async () => {
    if (!isCameraOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraPreviewStream(stream);
        setIsCameraOn(true);
        // Optional: publish camera to LiveKit later if needed
      } catch (err) {
        console.error('Camera access denied:', err);
        alert('Camera access denied.');
      }
    } else {
      if (cameraPreviewStream) {
        cameraPreviewStream.getTracks().forEach(track => track.stop());
      }
      setCameraPreviewStream(null);
      setIsCameraOn(false);
    }
  };

  // 🎥 Media State
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sessionChatMessages, setSessionChatMessages] = useState([]);
  const [newSessionMessage, setNewSessionMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const urlParams = new URLSearchParams(window.location.search);
  const isInstantWatch = urlParams.get('instant') === 'true';
  const [showCinemaSeatView, setShowCinemaSeatView] = useState(false);
  const [showSeatGrid, setShowSeatGrid] = useState(false);
  const [isHostBroadcasting, setIsHostBroadcasting] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [screenShareUrl, setScreenShareUrl] = useState(null);
  const sidebarRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const chatEndRef = useRef(null);
  const [localScreenTrack, setLocalScreenTrack] = useState(null);

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

  // Fetch room members
  useEffect(() => {
    if (!roomId || !currentUser) return;
    const fetchRoomMembers = async () => {
      try {
        const response = await getRoomMembers(roomId);
        const members = Array.isArray(response) ? response : response?.members || [];
        setRoomMembers(members);
        const hostMember = members.find(m => m.user_role === 'host');
        if (hostMember) {
          setRoomHostId(hostMember.id);
        }
      } catch (err) {
        console.error("Failed to fetch room members:", err);
        setRoomMembers([]);
      }
    };
    fetchRoomMembers();
  }, [roomId, currentUser]);

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
    setShowSeatGrid(true);
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
      } catch (err) {
        if (err.response?.status === 404) {
          navigate('/lobby');
        }
      }
    };
    joinRoomIfNeeded();
  }, [roomId, currentUser]);

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
    sendMessage({
      type: 'seat_update',
      userId: currentUser.id,
      seat: { row, col }
    });
    setUserSeats(prev => ({ ...prev, [currentUser.id]: seatId }));
  };

  // Fetch Media + Posters
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
        _isTemporary: true
      }));
      const updatedItems = await Promise.all(
        normalizedItems.map(async (item) => {
          if (item.poster_url && item.poster_url !== '/icons/placeholder-poster.jpg') {
            return item;
          }
          try {
            const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
            const fileUrl = item.file_url || item.file_path;
            const mediaUrl = fileUrl?.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl?.startsWith('/') ? '' : '/'}${fileUrl}`;
            
            const response = await fetch(mediaUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const videoBlob = await response.blob();
            const posterUrl = await generatePosterFromVideoFile(videoBlob);
            
            // ✅ Ensure posterUrl is a string (data URL), not a Blob
            if (typeof posterUrl !== 'string') {
              console.warn('⚠️ Poster generation returned non-string:', typeof posterUrl);
              return { ...item, poster_url: '/icons/placeholder-poster.jpg' };
            }
            
            return { ...item, poster_url: posterUrl };
          } catch (err) {
            console.warn('⚠️ Failed to generate poster for', item.file_name, err);
            return { ...item, poster_url: '/icons/placeholder-poster.jpg' };
          }
        })
      );
      setPlaylist(updatedItems);
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
          if (Array.isArray(data.members)) {
            setRoomMembers(data.members);
          }
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
      data: { message: newSessionMessage.trim(), session_id: sessionStatus.id },
    };
    sendMessage(chatMessage);
    setNewSessionMessage('');
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
  const handleLeaveRoom = () => {
    navigate(`/room/${roomId}`);
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

  // Audio Manager
  const {
    requestMicPermission,
    toggleAudio: rawToggleAudio,
  } = useAudioManager({
    hasMicPermission,
    setHasMicPermission,
    isAudioActive,
    setIsAudioActive,
    localStream,
    setLocalStream,
    wsConnected: isConnected,
    userSeats,
    authenticatedUserID: currentUser?.id,
    speakingUsers,
    setSpeakingUsers,
    isHost,
    isSeatedMode,
  });

  const toggleAudio = () => {
    const wasActive = isAudioActive;
    rawToggleAudio();
    setTimeout(() => {
      if (wasActive) playMicOffSound();
      else playMicOnSound();
    }, 0);
  };

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

  // Sync audio state
  useEffect(() => {
    if (localStream) {
      const tracks = localStream.getAudioTracks();
      if (tracks.length > 0) {
        const actualEnabled = tracks[0].enabled;
        if (actualEnabled !== isAudioActive) {
          setIsAudioActive(actualEnabled);
        }
      }
    }
  }, [localStream, isAudioActive]);

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
          onSeatsClick={handleSeatsClick}
          seats={seats}
          userSeats={userSeats}
          currentUser={currentUser}
          onMembersClick={() => { fetchRoomMembers(); setShowMembersModal(true);}}
        />
      )}

      {showSeatGrid && (
        <ScrollableSeatGrid
          seats={seats}
          userSeats={userSeats}
          currentUserID={currentUser?.id}
          onClose={() => setShowSeatGrid(false)}
          onSeatClick={handleSeatSwapRequest}
        />
      )}

      {isSeatsModalOpen && (
        <SeatsModal 
          seats={seats}
          userSeats={userSeats}
          currentUser={currentUser}
          onClose={() => setIsSeatsModalOpen(false)}
          onSwapRequest={handleSeatSwapRequest}
        />
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

      <VideoTiles 
        participants={participants} 
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