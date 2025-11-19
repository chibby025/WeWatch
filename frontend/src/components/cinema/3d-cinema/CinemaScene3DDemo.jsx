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
  const [isSeatControlsOpen, setIsSeatControlsOpen] = useState(false); // ✅ Renamed
  const chatEndRef = useRef(null);
  const processedMessageCountRef = useRef(0);
  const [isViewLocked, setIsViewLocked] = useState(true);   // ✅ ADD THIS
  const [lightsOn, setLightsOn] = useState(true);          // ✅ ADD THIS
  const [isSeatGridModalOpen, setIsSeatGridModalOpen] = useState(false);
  //const currentUserSeatId = currentUser?.id ? userSeats[currentUser.id] : null;
  const { currentSeat, jumpToSeat, currentSeatKey } = useSeatController({
    currentUser,
    initialSeatId: currentUser ? `${Math.floor((currentUser.id % 42) / 7)}-${(currentUser.id % 42) % 7}` : '0-0',
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

  
  // State for video ref
  const videoRef = useRef(null);
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

  // ✅ Now you have reliable isHost!
  console.log('🎭 isHost (from RoomPage):', isHost);
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

  // Full screen view of cinemascreen
  const toggleImmersiveMode = () => {
    setIsImmersiveMode(prev => !prev);
  };

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

    // 👇 Set up time update handler BEFORE loading new media
    const updateTime = () => setCurrentTime(video.currentTime);
    video.addEventListener('timeupdate', updateTime);

    if ((isHost && localScreenTrack?.mediaStreamTrack) || (!isHost && remoteScreenTrack?.mediaStreamTrack)) {
      const track = isHost ? localScreenTrack.mediaStreamTrack : remoteScreenTrack.mediaStreamTrack;
      const stream = new MediaStream([track]);
      video.srcObject = stream;
      video.muted = isHost;
      video.play().catch(e => console.warn("Play failed (screen share):", e));
    } else if (currentMedia?.type === 'upload' && currentMedia.mediaUrl) {
      video.src = currentMedia.mediaUrl;
      video.muted = false;
      video.load();
      video.play().catch(e => console.warn("Play failed (upload):", e));
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
          // Update userSeats from server echo (for consistency)
          if (msg.user_id && msg.seat_id) {
            setUserSeats(prev => ({
              ...prev,
              [msg.user_id]: msg.seat_id
            }));
          }
          break;
        // Inside the switch(msg.type) block:
        case "playback_control":
          if (msg.sender_id && msg.sender_id === currentUser?.id) break; // ignore own messages
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
          // ✅ Do NOT set remoteScreenTrack here — LiveKit useEffect handles it
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
            // 🔥 DEDUPLICATE by user ID
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
            console.log('✅ Deduplicated roomMembers:', deduplicated);
            setRoomMembers(deduplicated);
          }
          break;
        case 'user_audio_state':
          if (msg.userId === currentUser?.id) {
            setIsAudioActive(msg.isAudioActive);
          }
          break;
        default:
          break;
      }
    });
    processedMessageCountRef.current = messages.length;
  }, [messages, sessionStatus?.id, currentUser?.id]);

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
    jumpToSeat(seatId);

    // ✅ Optimistically update local state immediately
    setUserSeats(prev => ({ ...prev, [currentUser.id]: seatId }));

    const [rowStr, colStr] = seatId.split('-');
    const row = parseInt(rowStr);
    const col = parseInt(colStr);
    sendMessage({
      type: 'take_seat',
      seat_id: seatId,
      row,
      col,
      user_id: currentUser.id
    });
    setIsSeatGridModalOpen(false);
    setIsSeatControlsOpen(false);
  };

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

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Hidden video player (same as VideoWatch) */}
      {/* 🔥 Hidden <video> for 3D screen texture */}
      <video
        ref={videoRef}
        className="absolute -z-10 opacity-0"
        style={{ width: 1, height: 1 }}
        crossOrigin="anonymous"
        autoPlay
        playsInline
        muted
        onError={handleError}
      />
      {console.log('🎥 [3D] Passing videoElement to CinemaScene3D:', videoRef.current)}

      {/* 3D Scene */}
      <CinemaScene3D
        useGLBModel="improved"
        authenticatedUserID={currentUser?.id}
        videoElement={videoRef.current}
        isViewLocked={isViewLocked}
        currentUserSeat={currentSeat} 
        debugMode={true}
        lightsOn={lightsOn}
        roomMembers={roomMembers}
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
      {console.log('🎬 Final roomMembers passed to Taskbar:', roomMembers)}
      {/* Taskbar */}
      <Taskbar
        authenticatedUserID={currentUser?.id}
        isAudioActive={isAudioActive}
        toggleAudio={toggleAudio}
        isHost={isHost}
        isSeatedMode={isSeatedMode}
        roomMembers={roomMembers} // ✅ pass full list
        toggleSeatedMode={handleToggleSeatedMode}
        openChat={() => setIsChatOpen(prev => !prev)}
        onMembersClick={openMembers}
        onShareRoom={() => alert('Share room')}
        onSeatsClick={() => {
          setIsSeatControlsOpen(prev => !prev);
          setIsSeatGridModalOpen(prev => !prev);
        }}
        seats={[]}
        userSeats={userSeats}
        currentUser={currentUser}
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
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(prev => !prev)}
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

      {/* Seat Controls Panel */}
      {isSeatControlsOpen && (
        <div className="absolute top-12 right-4 bg-black bg-opacity-90 text-white p-4 rounded-lg text-sm max-w-xs max-h-[80vh] overflow-y-auto z-10">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-yellow-400">🪑 Seat Controls</h3>
            <button
              onClick={() => setIsSeatControlsOpen(false)}
              className="text-gray-400 hover:text-white text-lg"
              aria-label="Close seat controls"
            >
              ×
            </button>
          </div>

          <div className="space-y-3">
            {/* Seat selector */}
            <div>
              <label className="text-xs text-gray-300 block mb-1">Go to Seat (1–42):</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  min="1" 
                  max="42" 
                  value={currentUser?.id ? userSeats[currentUser.id]?.split('-')?.[1] || 1 : 1}
                  onChange={(e) => {
                    const seatId = parseInt(e.target.value) || 1;
                    const row = Math.floor((seatId - 1) / 7);
                    const col = (seatId - 1) % 7;
                    handleSeatSelect(`${row}-${col}`);
                  }}
                  className="bg-gray-800 text-white px-2 py-1 rounded w-16 text-xs"
                />
                <button
                  onClick={() => {
                    const randomSeat = Math.floor(Math.random() * 42) + 1;
                    const row = Math.floor((randomSeat - 1) / 7);
                    const col = (randomSeat - 1) % 7;
                    handleSeatSelect(`${row}-${col}`);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs"
                >
                  Random
                </button>
              </div>
            </div>

            {/* Quick seat buttons */}
            <div>
              <div className="text-xs text-gray-300 mb-1">Quick Jump:</div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: '0-0', label: 'Front-L', color: 'gray' },
                  { id: '0-3', label: 'Front-M', color: 'gray' },
                  { id: '0-6', label: 'Front-R', color: 'gray' },
                  { id: '2-0', label: 'Mid-L ⭐', color: 'yellow' },
                  { id: '2-3', label: 'Mid-M ⭐', color: 'yellow' },
                  { id: '2-6', label: 'Mid-R ⭐', color: 'yellow' },
                  { id: '5-0', label: 'Back-L', color: 'gray' },
                  { id: '5-3', label: 'Back-M', color: 'gray' },
                  { id: '5-6', label: 'Back-R', color: 'gray' },
                ].map((seat) => (
                  <button
                    key={seat.id}
                    onClick={() => handleSeatSelect(seat.id)}
                    className={`px-2 py-1 rounded text-[10px] ${
                      seat.color === 'yellow'
                        ? 'bg-yellow-700 hover:bg-yellow-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                    }`}
                  >
                    {seat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
              <p>⭐ = Premium middle seats</p>
              <p className="mt-1">Markers show avatar positions</p>
            </div>
          </div>

          {/* VIEW CONTROLS SECTION */}
          <div className="mt-4 pt-3 border-t border-gray-700 space-y-3">
            <h3 className="font-bold text-blue-400">🎮 View Controls</h3>
            
            <button
              onClick={() => setIsViewLocked(!isViewLocked)}
              className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                isViewLocked 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isViewLocked ? '🔒 View Locked' : '🔓 View Unlocked'}
            </button>

            <button
              onClick={() => setLightsOn(!lightsOn)}
              className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                lightsOn 
                  ? 'bg-yellow-600 hover:bg-yellow-700' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {lightsOn ? '💡 Lights On' : '🌑 Lights Off'}
            </button>

            <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
              <p className="font-bold text-white mb-1">🎭 Avatar System:</p>
              <p>• {roomMembers.length} users in cinema</p>
              <p>• Rayman-style floating hands</p>
              <p>• White gloves with colored glow</p>
              <p>• Breathing & look-around animations</p>
              <p className="mt-1 text-yellow-400">Try switching seats to see avatars!</p>
            </div>

            <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
              <p className="font-bold text-white mb-1">😊 Emote Controls:</p>
              <p>• Press 1: 👋 Wave</p>
              <p>• Press 2: 👏 Clap</p>
              <p>• Press 3: 👍 Thumbs Up</p>
              <p>• Press 4: 😂 Laugh</p>
              <p>• Press 5: ❤️ Heart</p>
              <p className="mt-1 text-yellow-400">Test emotes with keyboard!</p>
            </div>

            <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
              <p className="font-bold text-white mb-1">🔒 Locked Mode (Seated):</p>
              <p>• WASD / Arrow Keys: Look around</p>
              <p>• Mouse drag: Also look around</p>
              <p>• L: Look left (default view)</p>
              <p>• C: Look at screen (center)</p>
              <p>• R: Look right (mirrored view)</p>
              <p>• Position locked to seat</p>
              
              <p className="font-bold text-white mt-2 mb-1">🔓 Unlocked Mode (Free Roam):</p>
              <p>• WASD: Move forward/back/left/right</p>
              <p>• Q/E: Move up/down</p>
              <p>• Arrow Keys: Pan view direction</p>
              <p>• 1-6: Snap to axis views</p>
              <p className="text-[9px] text-gray-500 mt-1">(1=Front, 2=Back, 3=Left, 4=Right, 5=Top, 6=Bottom)</p>
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
        />
      )}

      {/* ✅ Seat Grid Modal — NOW INSIDE THE ROOT DIV */}
      <CinemaSeatGridModal
        key={currentUser?.id ? userSeats[currentUser.id] : 'default'}
        isOpen={isSeatGridModalOpen}
        onClose={() => setIsSeatGridModalOpen(false)}
        userSeats={userSeats}
        currentUser={currentUser}
        roomMembers={roomMembers}
        onTakeSeat={(seatId) => {
          if (!currentUser || !sendMessage) return;
          jumpToSeat(seatId);
          const [rowStr, colStr] = seatId.split('-');
          const row = parseInt(rowStr);
          const col = parseInt(colStr);
          sendMessage({
            type: 'take_seat',
            seat_id: seatId,
            row,
            col,
            user_id: currentUser.id
          });
          setIsSeatGridModalOpen(false);
        }}
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
          />
        </div>
      )}
    </div> // 👈 Only one root element
  );
}