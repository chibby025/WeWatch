// frontend/src/pages/PositionCalculatorPage.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Text } from '@react-three/drei';
import * as THREE from 'three';
import toast from 'react-hot-toast';
import { sendFriendRequest, getFriendshipStatus, apiClient } from '../services/api';
import Taskbar from '../components/Taskbar';
import FlatUserIcon from '../components/cinema/3d-cinema/avatars/FlatUserIcon';
import LectureHallAvatarManager from '../components/cinema/3d-cinema/avatars/LectureHallAvatarManager';
import lectureHallCameraPositions from '../data/lectureHallCameraPositions';
import { lectureHallLeftRightViews } from '../data/lectureHallLeftRightViews';
import useAuth from '../hooks/useAuth';
import useWebSocket from '../hooks/useWebSocket';
import useLectureHallAudio, { isInSameRowGroup } from '../hooks/useLectureHallAudio';
import useLiveKitRoom from '../hooks/useLiveKitRoom';
import { RoomEvent, Track, LocalVideoTrack } from 'livekit-client'; // For selective subscription and screen share
import { useSeatSwap } from '../hooks/useSeatSwap';
import { getLectureHallSeatById, getLectureHallHostSeat } from '../components/cinema/3d-cinema/seatCalculator';
import { getChatHistory, endWatchSession, getSessionTemporaryMedia, getActiveSession } from '../services/api';
import ChatHomeModal from '../components/ChatHomeModal';
import PrivateChatModal from '../components/PrivateChatModal';
import LectureHallMembersModal from '../components/LectureHallMembersModal';
import UserProfileModal from '../components/UserProfileModal';
import LectureHallSeatsGrid from '../components/cinema/ui/LectureHallSeatsGrid';
import SeatSwapNotification from '../components/cinema/ui/SeatSwapNotification';
import LeftSidebar from '../components/cinema/ui/LeftSidebar';
import QuizManagementModal from '../components/cinema/modals/QuizManagementModal';
import MakeQuizModal from '../components/cinema/modals/MakeQuizModal';
import TakeQuizModal from '../components/cinema/modals/TakeQuizModal';
import BlackboardMediaPlayer from '../components/classroom/BlackboardMediaPlayer';
import CinemaVideoPlayer from '../components/cinema/ui/CinemaVideoPlayer';
import { playSeatSound, playMicOnSound, playMicOffSound } from '../utils/audio';
import LiveKitAudioDebugPanel from '../components/LiveKitAudioDebugPanel';
import logger from '../utils/logger';
import FloatingGiftIcon from '../components/FloatingGiftIcon';
import DonationNotification from '../components/DonationNotification';


// ✅ Constant empty array - prevents recreation on every render
const EMPTY_LECTURE_HALL_SEATS = [];

// ✅ API base URL for quiz fetches
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// ✅ SessionStorage keys for quiz persistence
const STORAGE_KEYS = {
  QUIZZES: 'wewatch_quizzes',
  ACTIVE_QUIZ: 'wewatch_active_quiz',
  QUIZ_RESULTS: 'wewatch_quiz_results',
  QUIZ_PROGRESS: 'wewatch_quiz_progress',
  QUIZ_HISTORY: 'wewatch_quiz_history',
};

// LiveShare Fullscreen Component - Handles MediaStream for screen share
function LiveShareFullscreen({ stream, cameraStream, onExit, liveShareMode }) {
  const videoRef = useRef();
  const cameraVideoRef = useRef();
  
  // Attach screen share stream (only when not in camera-only mode)
  useEffect(() => {
    if (stream && videoRef.current && liveShareMode !== 'camera') {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        if (!err.message.includes('aborted')) {
          console.error('❌ [LiveShareFullscreen] Play error:', err);
        }
      });
    }
  }, [stream, liveShareMode]);
  
  // Attach camera stream
  useEffect(() => {
    if (cameraStream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = cameraStream;
      cameraVideoRef.current.play().catch(err => {
        if (!err.message.includes('aborted')) {
          console.error('❌ [LiveShareFullscreen] Camera play error:', err);
        }
      });
    }
  }, [cameraStream]);
  
  const cameraContainerClass = liveShareMode === 'camera' 
    ? "w-full h-full flex items-center justify-center"
    : "absolute top-8 right-8 w-80 h-45 rounded-lg overflow-hidden shadow-2xl border-2 border-white/20";
  
  const isCameraFullscreen = liveShareMode === 'camera';
  
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Main screen share video - COVER fills entire screen (hidden if camera-only mode) */}
      {stream && liveShareMode !== 'camera' && (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
        />
      )}
      
      {/* Camera video - always render same element, change wrapper styles based on mode */}
      {cameraStream && (
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
      
      {/* Exit fullscreen hint */}
      <div className="absolute top-4 left-4 text-white bg-black bg-opacity-50 px-4 py-2 rounded">
        Press <kbd className="bg-gray-700 px-2 py-1 rounded">F</kbd> or <kbd className="bg-gray-700 px-2 py-1 rounded">ESC</kbd> to exit fullscreen
      </div>
      
      {/* Exit button */}
      <button
        onClick={onExit}
        className="absolute top-4 right-4 bg-red-500/80 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
      >
        ✕ Exit Fullscreen
      </button>
    </div>
  );
}

// Mesh marker component - shows position with label
function MeshMarker({ position, name, color }) {
  return (
    <group position={[parseFloat(position.x), parseFloat(position.y), parseFloat(position.z)]}>
      {/* Sphere marker */}
      <mesh>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      
      {/* Floating label */}
      <Text
        position={[0, 0.5, 0]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="black"
      >
        {name}
      </Text>
    </group>
  );
}

// Blackboard with video texture support (supports both URL and MediaStream)
function BlackboardWithMedia({ position, dimensions, media, onClose, isHost, sendMessage, videoElementRef, cameraVideoElementRef, onTimeUpdate, onRemoveCamera, liveShareMode, onFullscreenRequest, pendingSeekTime, setPendingSeekTime, loadStartTimeRef }) {
  const videoRef = useRef();
  const cameraVideoRef = useRef();
  const [videoTexture, setVideoTexture] = useState(null);
  const [cameraTexture, setCameraTexture] = useState(null);
  const videoTextureRef = useRef(null);
  const cameraTextureRef = useRef(null);
  const [showCameraClose, setShowCameraClose] = useState(false);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  
  // ✅ OPTIMIZATION: Mounting stability refs to prevent cleanup during initialization
  const isMountingRef = useRef(true);
  const hasInitializedRef = useRef(false);
  
  // ✅ DEBUG: Real video playback FPS tracking (not render FPS)
  const videoFrameCountRef = useRef(0);
  const lastVideoTimeRef = useRef(0);
  const lastVideoFpsLogRef = useRef(Date.now());
  const renderFrameCountRef = useRef(0);
  const lastRenderFpsLogRef = useRef(Date.now());
  
  // ✅ Use refs for callbacks to prevent dependency array size changes
  const sendMessageRef = useRef(sendMessage);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const isHostRef = useRef(isHost);
  const onRemoveCameraRef = useRef(onRemoveCamera);
  
  // Update refs when props change
  useEffect(() => {
    sendMessageRef.current = sendMessage;
    onTimeUpdateRef.current = onTimeUpdate;
    isHostRef.current = isHost;
    onRemoveCameraRef.current = onRemoveCamera;
  }, [sendMessage, onTimeUpdate, isHost, onRemoveCamera]);

  // console.log('🎥 [BlackboardWithMedia] Render:', { 
  //   hasMedia: !!media, 
  //   mediaUrl: media?.file_url || media?.url,
  //   mediaType: media?.type,
  //   hasVideoTexture: !!videoTexture 
  // });

  useEffect(() => {
    // ✅ OPTIMIZATION: Mark mounting as complete after first effect run
    isMountingRef.current = false;
    
    if (!media) {
      setVideoTexture(null);
      videoTextureRef.current = null;
      setCameraTexture(null);
      cameraTextureRef.current = null;
      setIsLoadingStream(false);
      
      // ✅ OPTIMIZATION: Only pause if not in mounting phase (prevents AbortError)
      if (videoRef.current && !isMountingRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.srcObject = null;
      }
      if (cameraVideoRef.current && !isMountingRef.current) {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
      }
      return;
    }
    
    // ✅ Check if we're waiting for a LiveShare stream to load
    if (media.type === 'liveshare' && !media.stream && !media.cameraStream) {
      setIsLoadingStream(true);
      console.log('⏳ [BlackboardWithMedia] Waiting for LiveShare stream...');
      return;
    } else {
      setIsLoadingStream(false);
    }
    
    // ✅ If media has ended flag, clear texture to show white background
    if (media.ended) {
      console.log('✅ [BlackboardWithMedia] Media has ended flag - CLEARING TEXTURE NOW');
      setVideoTexture(null);
      videoTextureRef.current = null;
      setCameraTexture(null);
      cameraTextureRef.current = null;
      setIsLoadingStream(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.srcObject = null;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
      }
      return;
    }
    
    // ✅ Handle MediaStream (LiveKit screen/camera)
    if (media.stream) {
      console.log('🎥 [BlackboardWithMedia] Creating video element for MediaStream:', media.type);
      console.log('🔍 [DEBUG - SCREEN] Current state:', {
        hasStream: !!media.stream,
        hasCameraStream: !!media.cameraStream,
        liveShareMode: liveShareMode,
        streamId: media.stream.id,
        videoTracks: media.stream.getVideoTracks().length,
        audioTracks: media.stream.getAudioTracks().length
      });
      
      const video = document.createElement('video');
      video.srcObject = media.stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = false; // ✅ NOT muted - screen share may include tab audio (video sound)
      
      console.log('🎬 [DEBUG - SCREEN] Video element created:', {
        videoId: video.id || 'no-id',
        autoplay: video.autoplay,
        muted: video.muted,
        readyState: video.readyState,
        paused: video.paused
      });
      
      videoRef.current = video;
      if (videoElementRef) {
        videoElementRef.current = video;
      }

      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.encoding = THREE.sRGBEncoding;
      
      console.log('🎥 [BlackboardWithMedia] VideoTexture created for stream');
      setVideoTexture(texture);
      videoTextureRef.current = texture;
      
      // ✅ DEBUG: Log video quality metrics when metadata loads
      video.addEventListener('loadedmetadata', () => {
        console.log('📊 [VIDEO QUALITY DEBUG]', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          resolution: `${video.videoWidth}x${video.videoHeight}`,
          tracks: media.stream.getVideoTracks().map(t => ({
            label: t.label,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
            settings: t.getSettings()
          }))
        });
      });
      
      // ✅ DEBUG: Track real video playback FPS (actual frames, not render loop)
      const trackVideoFPS = () => {
        if (!video.paused && video.readyState >= 2) {
          const currentTime = video.currentTime;
          
          // Count frame if time advanced
          if (currentTime !== lastVideoTimeRef.current) {
            videoFrameCountRef.current++;
            lastVideoTimeRef.current = currentTime;
          }
          
          // Log FPS every 3 seconds
          const now = Date.now();
          const elapsed = now - lastVideoFpsLogRef.current;
          if (elapsed >= 3000) {
            const videoFps = Math.round((videoFrameCountRef.current / elapsed) * 1000);
            const track = media.stream.getVideoTracks()[0];
            const actualSettings = track?.getSettings() || {};
            
            console.log(`🎬 [VIDEO PLAYBACK FPS] ${videoFps} fps | Actual: ${actualSettings.width}x${actualSettings.height} | Display: ${video.videoWidth}x${video.videoHeight}`);
            
            videoFrameCountRef.current = 0;
            lastVideoFpsLogRef.current = now;
          }
        }
        
        // Use requestVideoFrameCallback for frame-accurate tracking (if available)
        if (video.requestVideoFrameCallback) {
          video.requestVideoFrameCallback(trackVideoFPS);
        }
      };
      
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(trackVideoFPS);
      }
      
      // Fallback: use timeupdate event for FPS tracking
      const timeupdateHandler = trackVideoFPS;
      video.addEventListener('timeupdate', timeupdateHandler);
      
      // ✅ DEBUG: Monitor buffering/stalling
      video.addEventListener('waiting', () => {
        console.warn('⏳ [VIDEO QUALITY] Video buffering/waiting for data');
      });
      
      video.addEventListener('playing', () => {
        console.log('▶️ [VIDEO QUALITY] Video playing smoothly');
      });
      
      // ✅ OPTIMIZATION: Sequential playback - wait for camera before playing screen
      // Screen video play will be triggered AFTER camera starts (if camera exists)
      // If no camera, play immediately
      const playScreenVideo = () => {
        console.log('▶️ [DEBUG - SCREEN] Attempting to play screen video at:', new Date().toISOString());
        video.play()
          .then(() => {
            console.log('✅ [DEBUG - SCREEN] Screen video play() SUCCESS at:', new Date().toISOString(), {
              paused: video.paused,
              currentTime: video.currentTime,
              readyState: video.readyState
            });
          })
          .catch(err => {
            console.error('❌ [BlackboardWithMedia] Failed to play stream:', err);
            console.error('❌ [DEBUG - SCREEN] Play error details:', {
              name: err.name,
              message: err.message,
              videoState: {
                paused: video.paused,
                muted: video.muted,
                autoplay: video.autoplay,
                readyState: video.readyState,
                hasUserInteracted: document.hasStorageAccess !== undefined
              }
            });
          });
      };
      
      // If no camera stream, play screen immediately
      if (!media.cameraStream) {
        console.log('📺 [DEBUG - SCREEN] No camera - playing screen immediately');
        playScreenVideo();
      } else {
        // Store play function to be called after camera starts
        console.log('⏳ [DEBUG - SCREEN] Camera exists - deferring screen playback until camera starts');
        video._deferredPlay = playScreenVideo;
      }
    }
    
    // ✅ Handle Camera Stream (picture-in-picture) - runs even if screen stream exists
    if (media.cameraStream) {
      console.log('📹 [BlackboardWithMedia] Creating camera video element for MediaStream');
      console.log('🔍 [DEBUG - CAMERA] Current state:', {
        hasCameraStream: !!media.cameraStream,
        hasScreenStream: !!media.stream,
        liveShareMode: liveShareMode,
        cameraStreamId: media.cameraStream.id,
        videoTracks: media.cameraStream.getVideoTracks().length,
        screenVideoExists: !!videoRef.current,
        screenVideoPlaying: videoRef.current ? !videoRef.current.paused : 'N/A'
      });
      
      const cameraVideo = document.createElement('video');
      cameraVideo.srcObject = media.cameraStream;
      cameraVideo.autoplay = true;
      cameraVideo.playsInline = true;
      cameraVideo.muted = true; // Muted because audio is handled by LiveKit
      
      console.log('🎬 [DEBUG - CAMERA] Camera video element created:', {
        videoId: cameraVideo.id || 'no-id',
        autoplay: cameraVideo.autoplay,
        muted: cameraVideo.muted,
        readyState: cameraVideo.readyState,
        paused: cameraVideo.paused
      });
      
      cameraVideoRef.current = cameraVideo;
      if (cameraVideoElementRef) {
        cameraVideoElementRef.current = cameraVideo; // ✅ Expose to parent component
      }

      const cameraTexture = new THREE.VideoTexture(cameraVideo);
      cameraTexture.minFilter = THREE.LinearFilter;
      cameraTexture.magFilter = THREE.LinearFilter;
      cameraTexture.encoding = THREE.sRGBEncoding;
      
      console.log('📹 [BlackboardWithMedia] Camera VideoTexture created');
      setCameraTexture(cameraTexture);
      cameraTextureRef.current = cameraTexture;
      
      // ✅ OPTIMIZATION: Sequential playback - play camera FIRST, then trigger screen
      console.log('▶️ [DEBUG - CAMERA] Attempting to play camera video at:', new Date().toISOString());
      
      // Trigger screen video after camera starts playing (if screen exists)
      const triggerScreenPlayback = () => {
        if (videoRef.current && videoRef.current._deferredPlay) {
          console.log('🎬 [DEBUG - SEQUENTIAL] Camera playing - triggering screen playback now');
          const playFn = videoRef.current._deferredPlay;
          delete videoRef.current._deferredPlay; // Clean up
          playFn();
        }
      };
      
      // Listen for camera playing event to trigger screen
      let playingTriggered = false;
      cameraVideo.addEventListener('playing', () => {
        if (!playingTriggered) {
          playingTriggered = true;
          console.log('✅ [DEBUG - CAMERA] Camera "playing" event fired');
          triggerScreenPlayback();
        }
      }, { once: true });
      
      // Fallback timeout in case 'playing' event doesn't fire
      const fallbackTimeout = setTimeout(() => {
        if (!playingTriggered) {
          console.warn('⏰ [DEBUG - CAMERA] Playing event timeout - triggering screen playback via fallback');
          triggerScreenPlayback();
        }
      }, 500);
      
      cameraVideo.play()
        .then(() => {
          console.log('✅ [DEBUG - CAMERA] Camera video play() SUCCESS at:', new Date().toISOString(), {
            paused: cameraVideo.paused,
            currentTime: cameraVideo.currentTime,
            readyState: cameraVideo.readyState
          });
          // If play() resolves but 'playing' hasn't fired yet, wait for it
          // The 'playing' event is more reliable for when actual playback starts
        })
        .catch(err => {
          console.error('❌ [BlackboardWithMedia] Failed to play camera:', err);
          console.error('❌ [DEBUG - CAMERA] Play error details:', {
            name: err.name,
            message: err.message,
            videoState: {
              paused: cameraVideo.paused,
              muted: cameraVideo.muted,
              autoplay: cameraVideo.autoplay,
              readyState: cameraVideo.readyState
            },
            screenVideoState: videoRef.current ? {
              paused: videoRef.current.paused,
              playing: !videoRef.current.paused,
              currentTime: videoRef.current.currentTime
            } : 'No screen video'
          });
          // Even on error, try to play screen video (fallback)
          clearTimeout(fallbackTimeout);
          triggerScreenPlayback();
        });
    }
    
    // ✅ Handle URL-based media (uploaded files) - USE SHARED VIDEO ELEMENT
    const videoUrl = media.file_url || media.url;
    if (videoUrl && !media.stream && !media.cameraStream) {
      console.log('🎥 [BlackboardWithMedia] Using shared video element for URL:', videoUrl);

      // Use the shared video element passed from parent
      const video = videoElementRef?.current;
      if (!video) {
        console.error('❌ [BlackboardWithMedia] Shared video element not available!');
        return;
      }

      // Set video source if different
      if (video.src !== videoUrl) {
        video.src = videoUrl;
        video.load();
      }
      
      videoRef.current = video;

      const handleTimeUpdate = () => {
        if (onTimeUpdateRef.current) {
          onTimeUpdateRef.current(video.currentTime);
        }
      };
      video.addEventListener('timeupdate', handleTimeUpdate);

      // ✅ Wait for metadata to load BEFORE creating texture (fixes WebGL timing warning)
      const handleMetadata = () => {
        console.log('✅ [BlackboardWithMedia] Video metadata loaded, creating texture...');
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.encoding = THREE.sRGBEncoding;
        
        console.log('🎥 [BlackboardWithMedia] VideoTexture created from shared element');
        setVideoTexture(texture);
        videoTextureRef.current = texture;
      };

      const handleLoadedData = () => {
        console.log('✅ [BlackboardWithMedia] Video data loaded, attempting play...');
        
        // 🎯 Apply pending seek time if available (for mid-playback sync)
        if (pendingSeekTime !== null && pendingSeekTime > 0) {
          // 🚀 Triple compensation: network latency + loading time
          const loadingDuration = (Date.now() - loadStartTimeRef.current) / 1000;
          const compensatedTime = pendingSeekTime + loadingDuration;
          
          console.log(`🎯 [Lecture Hall Sync] Latency compensation applied:`, {
            originalSeekTime: pendingSeekTime.toFixed(2),
            loadingDuration: loadingDuration.toFixed(2),
            compensatedTime: compensatedTime.toFixed(2)
          });
          
          video.currentTime = compensatedTime;
          setPendingSeekTime(null); // Clear after applying
        }
        
        video.play().catch(err => console.error('❌ [BlackboardWithMedia] Failed to play video:', err));
      };
      
      const handleError = (e) => {
        console.error('❌ [BlackboardWithMedia] Video error:', e);
      };
      
      const handleEnded = () => {
        console.log('🏁 [BlackboardWithMedia] Video element ended event fired!');
        setVideoTexture(null);
        videoTextureRef.current = null;
        
        if (isHostRef.current && sendMessageRef.current) {
          sendMessageRef.current({
            type: 'media_ended',
            data: {
              media_id: media.id || media.media_id,
              final_timestamp: video.duration
            }
          });
        }
      };

      video.addEventListener('loadedmetadata', handleMetadata);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('error', handleError);
      video.addEventListener('ended', handleEnded);

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('loadedmetadata', handleMetadata);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('error', handleError);
        video.removeEventListener('ended', handleEnded);
        // Don't pause or clear src - it's shared
        if (videoTextureRef.current) {
          videoTextureRef.current.dispose();
          videoTextureRef.current = null;
        }
      };
    }
    
    // ✅ Cleanup function for streams
    return () => {
      if (videoRef.current && media.stream) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      if (cameraVideoRef.current && media.cameraStream) {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
      }
      if (videoTextureRef.current) {
        videoTextureRef.current.dispose();
        videoTextureRef.current = null;
      }
      if (cameraTextureRef.current) {
        cameraTextureRef.current.dispose();
        cameraTextureRef.current = null;
      }
      if (videoElementRef) {
        videoElementRef.current = null;
      }
    };
  }, [media, videoElementRef]);

  // Update texture on every frame
  useFrame(() => {
    if (
      videoTextureRef.current &&
      videoRef.current &&
      !videoRef.current.paused &&
      videoRef.current.readyState >= 2
    ) {
      videoTextureRef.current.needsUpdate = true;
      
      // ✅ DEBUG: Log THREE.js render FPS every 5 seconds (separate from video FPS)
      renderFrameCountRef.current++;
      const now = Date.now();
      const elapsed = now - lastRenderFpsLogRef.current;
      if (elapsed >= 5000) {
        const renderFps = Math.round((renderFrameCountRef.current / elapsed) * 1000);
        console.log(`🎨 [RENDER LOOP] ${renderFps} fps (THREE.js rendering, not video playback)`);
        renderFrameCountRef.current = 0;
        lastRenderFpsLogRef.current = now;
      }
    }
    
    if (
      cameraTextureRef.current &&
      cameraVideoRef.current &&
      !cameraVideoRef.current.paused &&
      cameraVideoRef.current.readyState >= 2
    ) {
      cameraTextureRef.current.needsUpdate = true;
    }
  });

  // Handle click to enter fullscreen (like 3D Cinema)
  const handleClick = useCallback(() => {
    // Only trigger if media is actually active
    const hasMedia = media;
    const isMediaActive = media && (
      (videoRef.current && !videoRef.current.paused) || 
      (media.type === 'liveshare' || media.type === 'watchfrom')
    );
    
    if (hasMedia && isMediaActive && onFullscreenRequest) {
      console.log('🖱️ [BlackboardWithMedia] Blackboard clicked - entering fullscreen');
      onFullscreenRequest();
    } else {
      console.log('⚠️ [BlackboardWithMedia] Blackboard clicked but no media playing');
    }
  }, [media, onFullscreenRequest]);

  return (
    <>
      {/* Main blackboard - show camera texture if camera-only mode, otherwise show screen share */}
      <mesh 
        position={position} 
        rotation={[0, 0, 0]}
        onClick={handleClick}
      >
        <boxGeometry args={dimensions} />
        {(() => {
          if (liveShareMode === 'camera' && cameraTexture) {
            return (
              <meshBasicMaterial 
                map={cameraTexture} 
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            );
          } else if (videoTexture && !media?.ended) {
            return (
              <meshBasicMaterial 
                map={videoTexture} 
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            );
          } else {
            return <meshStandardMaterial color="#f5f5f5" />;
          }
        })()}
      </mesh>
      
      {/* Loading indicator for LiveShare stream */}
      {isLoadingStream && (
        <group position={[position[0], position[1], position[2] + 0.3]}>
          <Text
            fontSize={6}
            color="#3b82f6"
            anchorX="center"
            anchorY="middle"
          >
            Connecting to stream...
          </Text>
        </group>
      )}
      
      {/* Picture-in-picture camera overlay (top-right corner) - hidden if camera-only mode */}
      {(() => {
        const showCameraPiP = cameraTexture && media?.cameraStream && liveShareMode !== 'camera';
        const pipWidth = dimensions[0] * 0.18;
        const pipHeight = dimensions[0] * 0.18 * (9/16);
        
        return showCameraPiP ? (
          <group
            position={[
              position[0] + dimensions[0] * 0.30,  // Right side (30% from center)
              position[1] + dimensions[1] * 0.30,  // Top side (30% from center)
              position[2] + 0.6                     // Slightly in front
            ]}
            onPointerEnter={() => setShowCameraClose(true)}
            onPointerLeave={() => setShowCameraClose(false)}
          >
          {/* Camera video mesh (18% of board width, 16:9 aspect ratio) */}
          <mesh>
            <planeGeometry args={[dimensions[0] * 0.18, dimensions[0] * 0.18 * (9/16)]} />
            <meshBasicMaterial 
              map={cameraTexture} 
              toneMapped={false}
            />
          </mesh>
          
          {/* Rounded border effect */}
          <lineSegments position={[0, 0, 0.01]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(dimensions[0] * 0.18, dimensions[0] * 0.18 * (9/16))]} />
            <lineBasicMaterial color="#ffffff" linewidth={2} />
          </lineSegments>
          
          {/* Close button (top-right of camera, visible on hover) */}
          {showCameraClose && (
            <mesh
              position={[
                dimensions[0] * 0.18 * 0.45,  // Right edge
                dimensions[0] * 0.18 * (9/16) * 0.45,  // Top edge
                0.02
              ]}
              onClick={(e) => {
                e.stopPropagation();
                if (onRemoveCameraRef.current) {
                  onRemoveCameraRef.current();
                }
              }}
            >
              <circleGeometry args={[2, 32]} />
              <meshBasicMaterial color="#ef4444" opacity={0.9} transparent />
              
              {/* X symbol */}
              <group position={[0, 0, 0.01]}>
                <mesh rotation={[0, 0, Math.PI / 4]}>
                  <planeGeometry args={[2.5, 0.4]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
                <mesh rotation={[0, 0, -Math.PI / 4]}>
                  <planeGeometry args={[2.5, 0.4]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            </mesh>
          )}
          </group>
        ) : null;
      })()}
    </>
  );
}

// Mesh markers container
function MeshMarkers({ visibleMarkers, meshes }) {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff'];
  
  return (
    <>
      {meshes.map((mesh, idx) => {
        if (!visibleMarkers[idx]) return null;
        return (
          <MeshMarker
            key={idx}
            position={mesh.position}
            name={mesh.name || `Mesh ${idx}`}
            color={colors[idx % colors.length]}
          />
        );
      })}
    </>
  );
}

// Preview seats markers (generated seats)
function PreviewSeats({ seats, showPreview }) {
  if (!showPreview || seats.length === 0) return null;
  
  // Color code by column: Red (1-40), Green (41-104), Blue (105-144), Gold (145-host)
  const getColor = (seat) => {
    if (seat.isHost) return '#ffd700'; // Gold for host/teacher
    if (seat.id <= 40) return '#ff3333'; // Column 1 - Red (5 seats/row)
    if (seat.id <= 104) return '#33ff33'; // Column 2 - Green (8 seats/row)
    return '#3333ff'; // Column 3 - Blue (5 seats/row)
  };
  
  // Size: Host sphere is larger
  const getSize = (seat) => {
    return seat.isHost ? 2.5 : 1.5;
  };
  
  return (
    <>
      {seats.map((seat) => (
        <group key={seat.id} position={seat.position}>
          <mesh>
            <sphereGeometry args={[getSize(seat), 16, 16]} />
            <meshStandardMaterial 
              color={getColor(seat)} 
              emissive={getColor(seat)} 
              emissiveIntensity={0.7}
              transparent={true}
              opacity={0.8}
            />
          </mesh>
          
          <Text
            position={[0, 2, 0]}
            fontSize={seat.isHost ? 1.8 : 1.2}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.1}
            outlineColor="black"
          >
            {seat.isHost ? '👨‍🏫 HOST' : seat.id}
          </Text>
        </group>
      ))}
    </>
  );
}

// Model component that loads the GLB file
function Model({ modelType, onModelClick, onModelLoaded, visibleMarkers }) {
  // Always use lecture_hall.glb for the classroom URL (repurposed for lecture hall)
  const modelPath = modelType === 'classroom' 
    ? '/models/lecture_hall.glb' 
    : '/models/lecture_hall.glb';
  
  const { scene } = useGLTF(modelPath);

  // Clone scene to avoid reuse issues
  const clonedScene = scene.clone();
  
  // Hide specific meshes
  const hiddenMeshes = ['walls_black_0', 'walls_screen_0', 'walls_water_0', 'walls_ceramic_0'];
  clonedScene.traverse((child) => {
    if (child.isMesh && hiddenMeshes.includes(child.name)) {
      child.visible = false;
    }
  });

  // Extract mesh information when model loads
  useEffect(() => {
    if (onModelLoaded) {
      const meshes = [];
      clonedScene.traverse((child) => {
        if (child.isMesh) {
          // Get bounding box center for accurate position
          child.geometry.computeBoundingBox();
          const bbox = child.geometry.boundingBox;
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          
          // Transform to world coordinates
          child.localToWorld(center);
          
          meshes.push({
            name: child.name,
            position: {
              x: center.x.toFixed(3),
              y: center.y.toFixed(3),
              z: center.z.toFixed(3)
            },
            type: child.type,
            mesh: child
          });
        }
      });
      onModelLoaded(meshes);
    }
  }, [clonedScene, onModelLoaded]);

  // Highlight selected meshes
  useEffect(() => {
    let meshIndex = 0;
    clonedScene.traverse((child) => {
      if (child.isMesh) {
        if (visibleMarkers[meshIndex]) {
          // Save original material if not saved
          if (!child.userData.originalMaterial) {
            child.userData.originalMaterial = child.material.clone();
          }
          // Apply blue highlight
          child.material = new THREE.MeshStandardMaterial({
            color: 0x0088ff,
            emissive: 0x0044ff,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.9
          });
        } else {
          // Restore original material
          if (child.userData.originalMaterial) {
            child.material = child.userData.originalMaterial;
          }
        }
        meshIndex++;
      }
    });
  }, [clonedScene, visibleMarkers]);

  return (
    <primitive 
      object={clonedScene} 
      scale={1} 
      onClick={(e) => {
        e.stopPropagation();
        const point = e.point;
        onModelClick(point);
      }}
    />
  );
}

// Camera position tracker component
function CameraTracker({ onCameraMove }) {
  useEffect(() => {
    const interval = setInterval(() => {
      onCameraMove();
    }, 100); // Update camera position every 100ms
    return () => clearInterval(interval);
  }, [onCameraMove]);
  
  return null;
}

const PositionCalculatorPage = () => {
  const { modelType: routeModelType } = useParams(); // 'classroom' or 'lecture-hall'
  const navigate = useNavigate();
  const location = useLocation();
  
  // TEMPORARY: Hardcode to 'lecture-hall' until routing is set up
  const modelType = routeModelType || 'lecture-hall';
  
  // Get session info from URL or state
  const { isHost: isHostFromState = false, sessionId: sessionIdFromState } = location.state || {};
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdFromUrl = urlParams.get('room_id');
  const sessionIdFromUrl = urlParams.get('session_id');
  const isInstantWatch = urlParams.get('instant') === 'true'; // ✅ Detect instant watch from URL
  const finalSessionId = sessionIdFromState || sessionIdFromUrl;
  const roomId = roomIdFromUrl;
  
  const { currentUser, loading: authLoading } = useAuth();
  
  // Get WebSocket token from sessionStorage (JWT, not session_id)
  const wsToken = sessionStorage.getItem('wewatch_ws_token');
  
  const controlsRef = useRef();
  
  // States
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, z: 0 });
  const [clickedPosition, setClickedPosition] = useState(null);
  const [savedSeats, setSavedSeats] = useState([]);
  const [currentSeatNumber, setCurrentSeatNumber] = useState(1);
  const [modelMeshes, setModelMeshes] = useState([]);
  const [showMeshInspector, setShowMeshInspector] = useState(false);
  const [visibleMarkers, setVisibleMarkers] = useState({});
  const [previewSeats, setPreviewSeats] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [currentSeatIndex, setCurrentSeatIndex] = useState(0);
  const [showSeatCycling, setShowSeatCycling] = useState(false);
  const [showSeatMarkers, setShowSeatMarkers] = useState(false);
  const [showCameraMarkers, setShowCameraMarkers] = useState(false);
  const [showPositionDebug, setShowPositionDebug] = useState(false);
  const [freeRoamMode, setFreeRoamMode] = useState(true); // Enable by default for correct camera positioning
  const [lockMovement, setLockMovement] = useState(true); // Lock pan/zoom by default
  const [lockOrbit, setLockOrbit] = useState(false); // Allow rotation by default
  
  // Saved camera positions for specific seats - will be populated when modelType is known
  const [savedCameraPositions, setSavedCameraPositions] = useState({});
  
  // Debug panels visibility
  const [showDebugPanels, setShowDebugPanels] = useState(false);
  const [showAudioDebugPanel, setShowAudioDebugPanel] = useState(false);
  
  // Left sidebar state
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  
  // Quiz modal state
  const [isQuizManagementOpen, setIsQuizManagementOpen] = useState(false);
  const [isMakeQuizOpen, setIsMakeQuizOpen] = useState(false);
  const [isTakeQuizOpen, setIsTakeQuizOpen] = useState(false);
  const [quizzes, setQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizResults, setQuizResults] = useState(null);
  const [quizProgress, setQuizProgress] = useState(null); // Host's quiz progress stats
  const [hasSubmittedQuiz, setHasSubmittedQuiz] = useState(false);
  const [quizHistory, setQuizHistory] = useState({ active_quizzes: [], completed_submissions: [] }); // Member's quiz history
  const [quizExportData, setQuizExportData] = useState(null); // ✅ Export data for viewing results
  
  // 👥 Friend request state
  const [profileModalUser, setProfileModalUser] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState(null); // 'none', 'pending', 'accepted'
  const [isRequester, setIsRequester] = useState(false); // Did current user send the request?
  // Token balance state for donation system
  const [tokenBalance, setTokenBalance] = useState(0);
  
  // Blackboard media state
  const [blackboardMedia, setBlackboardMedia] = useState(null);
  const [isMediaFullscreen, setIsMediaFullscreen] = useState(false);
  const sharedVideoRef = useRef(null); // ✅ Shared video element for both 3D board and fullscreen (uploaded media only)
  const videoInitializedRef = useRef(false);
  const boardVideoRef = useRef(null); // ✅ Legacy ref (kept for compatibility)
  const cameraVideoRef = useRef(null); // ✅ Ref to 3D board camera video element (for LiveShare camera)
  const boardVideoTimeRef = useRef(0); // ✅ Track current time for fullscreen sync
  const loadStartTimeRef = useRef(Date.now()); // ⏱️ Track video loading start time for sync compensation
  const [pendingSeekTime, setPendingSeekTime] = useState(null); // ⏱️ State-based seek (triggers re-renders)
  const [showFullscreenControls, setShowFullscreenControls] = useState(true); // Auto-hide close button
  const fullscreenInactivityTimerRef = useRef(null);
  
  // LiveShare state
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(false);
  const [liveShareMode, setLiveShareMode] = useState(null); // 'screen', 'camera', or 'both'
  const [sharingSource, setSharingSource] = useState(null); // 'liveshare' | 'watchfrom' | null - tracks which feature started the share
  const screenShareTrackRef = useRef(null);
  const cameraShareTrackRef = useRef(null);
  const [screenShareTrackSid, setScreenShareTrackSid] = useState(null);
  const [cameraShareTrackSid, setCameraShareTrackSid] = useState(null);
  const previousBlackboardStateRef = useRef(null); // Store blackboard state before LiveShare
  
  // Temporary playlist state (for session uploads)
  const [temporaryPlaylist, setTemporaryPlaylist] = useState([]);
  
  // Discussion mode button visibility (auto-hide after 1 second of no mouse movement)
  const [showDiscussionModeButton, setShowDiscussionModeButton] = useState(true);
  const discussionModeHideTimeoutRef = useRef(null);
  
  // View direction state (center, left, right)
  const [currentViewDirection, setCurrentViewDirection] = useState('center');
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [showViewDirectionModal, setShowViewDirectionModal] = useState(false);
  
  // 👁️ Host view mode: 145 (students) or 146 (board)
  const [hostViewSeat, setHostViewSeat] = useState(145);
  
  // 🎮 View control icons visibility (auto-hide after 3 seconds)
  const [showViewIcons, setShowViewIcons] = useState(true);
  const viewIconsHideTimeoutRef = useRef(null);
  
  // WebSocket and session state
  const [watchSessionMembers, setWatchSessionMembers] = useState([]); // Active watch session participants
  const hasApiFetchedMembersRef = useRef(false); // Track if we've fetched members from API to prevent fallback overwrite
  const [userSeats, setUserSeats] = useState({}); // userId -> seatId
  const [currentSeat, setCurrentSeat] = useState(null);
  const [isViewLocked, setIsViewLocked] = useState(true);
  const [lightsOn, setLightsOn] = useState(true);
  const [swapNotification, setSwapNotification] = useState(null);
  const [userIdToUsername, setUserIdToUsername] = useState({}); // userId -> username mapping
  
  // Raise hand & broadcasting state
  const [handRaised, setHandRaised] = useState(false);
  const [hasHostApproval, setHasHostApproval] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]); // [{userId, username, seatId}]
  const [approvedSpeakers, setApprovedSpeakers] = useState({}); // {userId: true}
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isSeatsModalOpen, setIsSeatsModalOpen] = useState(false);
  
  // Chat state
  const [showChatHome, setShowChatHome] = useState(false);
  const [sessionChatMessages, setSessionChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState(''); // Chat input state
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [privateMessages, setPrivateMessages] = useState({}); // {userId: [messages]}
  const [unreadMessages, setUnreadMessages] = useState({}); // {userId: unreadCount} - ✅ Unread tracking
  const [privateChatOpen, setPrivateChatOpen] = useState(false);
  const [privateChatUserId, setPrivateChatUserId] = useState(null);
  const [selectedChatUser, setSelectedChatUser] = useState(null); // Full user object for private chat
  
  // 🔍 DEBUG: Log privateMessages state changes
  useEffect(() => {
    console.log('💬 [State Change] privateMessages updated:', privateMessages);
  }, [privateMessages]);
  
  // Remote users' audio states
  const [remoteAudioStates, setRemoteAudioStates] = useState({}); // {userId: {isSpeaking: boolean, audioLevel: number}}
  
  // Refs
  const triggerLocalEmoteRef = useRef(null);
  
  // Avatar system - enabled by default to show real users
  const [showAvatars, setShowAvatars] = useState(true);
  const [hoveredAvatarId, setHoveredAvatarId] = useState(null);
  
  // Save camera modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [modalSeatNumber, setModalSeatNumber] = useState(1);
  
  // Calculate total seats based on model type
  // Classroom: 5x5 = 25 seats
  // Lecture Hall: Column 1 (5×8=40) + Column 2 (8×8=64) + Column 3 (5×8=40) + Host (1) = 145 seats
  const totalSeats = modelType === 'classroom' ? 25 : 145;
  
  // Track when OrbitControls ref is ready
  const [controlsReady, setControlsReady] = useState(false);
  
  // ✅ Keyboard movement toggle (WASDCV keys) - OFF by default
  const [freeCameraMovement, setFreeCameraMovement] = useState(false);
  
  // 🧪 Demo mode for testing seat views with 145 avatars
  const [demoMode, setDemoMode] = useState(false);
  
  // 🏛️ Lecture Hall overflow support
  const [currentLectureHall, setCurrentLectureHall] = useState(1); // User's assigned hall
  const [totalLectureHalls, setTotalLectureHalls] = useState(1); // Total active halls
  const [viewingHallNumber, setViewingHallNumber] = useState(1); // Hall user is currently viewing (host can switch)
  
  // 📱 Orientation detection for mobile
  const [showOrientationModal, setShowOrientationModal] = useState(false);
  const [isPortraitMode, setIsPortraitMode] = useState(false);
  
  // ⭐ Marked seats for review (stored in localStorage)
  const [markedSeats, setMarkedSeats] = useState(() => {
    try {
      const stored = localStorage.getItem('lecture_hall_marked_seats');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  
  // 🔄 Loading spinner state (shows for 0.8s after seat assignment)
  const { showLoadingOverlay: enableLoadingOverlay = false } = location.state || {};
  const [loadingStatus, setLoadingStatus] = useState(null); // Always start hidden
  const [hasSeatAssigned, setHasSeatAssigned] = useState(false);
  
  // 🐛 Debug: Track loading spinner state (logs on change + every 60s)
  useEffect(() => {
    const logSpinnerState = () => {
      const shouldShowSpinner = !!loadingStatus;
      console.log('🔄 [SPINNER DEBUG]', {
        loadingStatus,
        hasSeatAssigned,
        currentSeatId: currentSeat?.id || null,
        shouldShowSpinner,
        timestamp: new Date().toISOString()
      });
    };
    
    // Log immediately on change
    logSpinnerState();
    
    // Log every 60 seconds
    const interval = setInterval(logSpinnerState, 60000);
    return () => clearInterval(interval);
  }, [loadingStatus, hasSeatAssigned, currentSeat]);
  
  // Load hardcoded camera positions when modelType is known
  useEffect(() => {
    if (modelType === 'lecture-hall') {
      setSavedCameraPositions(lectureHallCameraPositions);
    }
  }, [modelType]);
  
  // 🧪 Populate demo data when demo mode is enabled
  useEffect(() => {
    if (demoMode && modelType === 'lecture-hall') {
      console.log(`🧪 [Demo Mode] Populating 145 demo avatars in Hall ${currentLectureHall}`);
      
      // Create demo userSeats mapping (userId → seatId)
      // Only populate current user's assigned hall
      const demoUserSeats = {};
      const demoUsernames = {};
      
      for (let i = 1; i <= 145; i++) {
        demoUserSeats[i] = i; // User ID matches seat ID
        demoUsernames[i] = i === 145 ? 'Demo Teacher' : `Demo User ${i}`;
      }
      
      setUserSeats(demoUserSeats);
      setUserIdToUsername(demoUsernames);
      console.log(`✅ [Demo Mode] Created 145 demo users in Hall ${currentLectureHall}`);
    } else if (!demoMode && modelType === 'lecture-hall') {
      // When demo mode is disabled, clear demo data (WebSocket will repopulate real data)
      console.log('🔄 [Demo Mode] Disabled - clearing demo avatars');
      // Don't clear immediately - let WebSocket data flow naturally
    }
  }, [demoMode, modelType, currentLectureHall]);
  
  // 🔍 DEBUG: Track blackboardMedia state changes
  useEffect(() => {
    console.log('🎬 [blackboardMedia State Changed]:', {
      hasMedia: !!blackboardMedia,
      fileUrl: blackboardMedia?.file_url,
      url: blackboardMedia?.url,
      mediaUrl: blackboardMedia?.mediaUrl,
      type: blackboardMedia?.type,
      title: blackboardMedia?.title,
      timestamp: blackboardMedia?.timestamp,
      playing: blackboardMedia?.playing,
      fullMedia: blackboardMedia
    });
  }, [blackboardMedia]);
  
  // WebSocket connection
  const { sendMessage, messages, isConnected, sessionStatus, disconnect, waitForAcknowledgment } = useWebSocket(
    roomId,
    wsToken,
    finalSessionId
  );
  
  // isConnected tracked internally
  
  // Message handling logged in useWebSocket
  
  // Track last processed message index to avoid skipping messages
  const lastProcessedIndexRef = useRef(-1);
  
  // Compute last message from messages array
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  
  // ✅ Get actual roomId and sessionId from sessionStatus if not in URL (for PositionCalculatorPage testing)
  // Convert roomId to integer (it may come as string from URL)
  const actualRoomId = roomId ? parseInt(roomId, 10) : sessionStatus?.room_id;
  // ✅ Use sessionStatus.session_id (UUID string for API calls), NOT the integer id
  const actualSessionId = sessionStatus?.session_id || finalSessionId;
  
  // 🔍 Debug log to track session ID
  // console.log('🔑 [PositionCalculator] Session ID tracking:', {
  //   sessionStatusId: sessionStatus?.id,
  //   sessionStatusSessionId: sessionStatus?.session_id,
  //   finalSessionId,
  //   actualSessionId,
  //   isUUID: actualSessionId && actualSessionId.length > 10
  // });
  
  // ✅ Fallback host detection from room data when sessionStatus doesn't have hostId
  const [roomHostId, setRoomHostId] = useState(null);
  
  useEffect(() => {
    // Fetch room data to get host_id if sessionStatus doesn't provide it
    if (!sessionStatus?.hostId && actualRoomId && currentUser) {
      import('../services/api').then(({ getRoom }) => {
        getRoom(actualRoomId)
          .then(response => {
            // ✅ API returns { room: { id, name, host_id, ... } }
            const hostId = response?.room?.host_id;
            console.log('🔍 [Host Detection] Fetched room host_id from API:', hostId);
            setRoomHostId(hostId);
          })
          .catch(err => {
            console.warn('⚠️ [Host Detection] Failed to fetch room data:', err);
          });
      });
    }
  }, [actualRoomId, currentUser, sessionStatus?.hostId]);
  
  // ✅ Multi-source host detection (priority order: sessionStatus > roomData > location.state)
  const isHostFromSession = currentUser?.id === sessionStatus?.hostId;
  const isHostFromRoomData = currentUser?.id === roomHostId;
  const isHost = isHostFromState || isHostFromSession || isHostFromRoomData;
  
  // console.log('👑 [Host Detection] Sources:', {
  //   isHostFromState,
  //   isHostFromSession: `${isHostFromSession} (sessionStatus.hostId=${sessionStatus?.hostId})`,
  //   isHostFromRoomData: `${isHostFromRoomData} (roomHostId=${roomHostId})`,
  //   finalIsHost: isHost,
  //   currentUserId: currentUser?.id
  // });
  
  // ✅ Create shared video element for uploaded media (document.body, like 3D Cinema)
  useEffect(() => {
    if (!sharedVideoRef.current && !videoInitializedRef.current) {
      console.log('🎬 [LectureHall] Creating shared video element for uploaded media');
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = false;
      video.autoplay = false; // Manual control
      video.playsInline = true;
      video.style.cssText = 'position: fixed; width: 100vw; height: 100vh; top: 0; left: 0; object-fit: contain; background: black; opacity: 0; z-index: -1; pointer-events: none; transition: opacity 0.3s ease;';
      video.id = 'shared-lecturehall-video';
      document.body.appendChild(video);
      sharedVideoRef.current = video;
      videoInitializedRef.current = true;
      console.log('✅ [LectureHall] Shared video element created and appended to body');
    }

    return () => {
      // Cleanup only on final unmount
      if (sharedVideoRef.current && document.body.contains(sharedVideoRef.current)) {
        console.log('🧹 [LectureHall] Cleaning up shared video element');
        sharedVideoRef.current.pause();
        sharedVideoRef.current.src = '';
        document.body.removeChild(sharedVideoRef.current);
        sharedVideoRef.current = null;
        videoInitializedRef.current = false;
      }
    };
  }, []);

  // ✅ CSS toggle effect for fullscreen mode (uploaded media only)
  useEffect(() => {
    const video = sharedVideoRef.current;
    if (!video) return;

    // Only apply to uploaded media, not LiveShare
    const isUploadedMedia = blackboardMedia && 
      blackboardMedia.type !== 'liveshare' && 
      blackboardMedia.type !== 'watchfrom';

    if (isMediaFullscreen && isUploadedMedia) {
      console.log('🎬 [LectureHall] Entering fullscreen mode - showing shared video');
      video.style.opacity = '1';
      video.style.zIndex = '9998'; // Below controls but above 3D scene
      video.style.pointerEvents = 'auto';
    } else {
      console.log('🎭 [LectureHall] Exiting fullscreen mode - hiding shared video');
      video.style.opacity = '0';
      video.style.zIndex = '-1';
      video.style.pointerEvents = 'none';
    }
  }, [isMediaFullscreen, blackboardMedia]);

  // ✅ Auto-hide fullscreen controls after 2 seconds of inactivity
  useEffect(() => {
    if (!isMediaFullscreen) return;
    
    // Only for uploaded media fullscreen
    const isUploadedMedia = blackboardMedia && 
      blackboardMedia.type !== 'liveshare' && 
      blackboardMedia.type !== 'watchfrom';
    
    if (!isUploadedMedia) return;
    
    setShowFullscreenControls(true);
    
    const handleMouseMove = () => {
      setShowFullscreenControls(true);
      if (fullscreenInactivityTimerRef.current) {
        clearTimeout(fullscreenInactivityTimerRef.current);
      }
      fullscreenInactivityTimerRef.current = setTimeout(() => {
        setShowFullscreenControls(false);
      }, 2000);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    handleMouseMove(); // Trigger initial timer
    
    return () => {
      window.addEventListener('mousemove', handleMouseMove);
      if (fullscreenInactivityTimerRef.current) {
        clearTimeout(fullscreenInactivityTimerRef.current);
      }
    };
  }, [isMediaFullscreen, blackboardMedia]);

  // ✅ REMOUNT TRACKING: Track mount count and detect triggers
  const mountCountRef = useRef(0);
  const prevPropsRef = useRef({});
  const mountTimestampRef = useRef(Date.now());
  
  // ✅ DEBUG: Component mount log with comprehensive trigger analysis
  useEffect(() => {
    mountCountRef.current += 1;
    const mountId = `mount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const timeSinceLastMount = now - mountTimestampRef.current;
    mountTimestampRef.current = now;
    
    // Detect what changed (triggers)
    const triggers = {
      sessionStatus: {
        changed: sessionStatus !== prevPropsRef.current.sessionStatus,
        prev: prevPropsRef.current.sessionStatus?.id,
        current: sessionStatus?.id,
        memberCountChanged: sessionStatus?.members?.length !== prevPropsRef.current.sessionStatus?.members?.length,
        seatingChanged: JSON.stringify(sessionStatus?.seating) !== JSON.stringify(prevPropsRef.current.sessionStatus?.seating)
      },
      roomId: {
        changed: roomId !== prevPropsRef.current.roomId,
        prev: prevPropsRef.current.roomId,
        current: roomId
      },
      sessionId: {
        changed: actualSessionId !== prevPropsRef.current.sessionId,
        prev: prevPropsRef.current.sessionId,
        current: actualSessionId
      },
      isConnected: {
        changed: isConnected !== prevPropsRef.current.isConnected,
        prev: prevPropsRef.current.isConnected,
        current: isConnected
      },
      messagesLength: {
        changed: messages?.length !== prevPropsRef.current.messagesLength,
        prev: prevPropsRef.current.messagesLength,
        current: messages?.length
      }
    };
    
    // Capture stack trace
    const stackTrace = new Error().stack?.split('\n').slice(2, 8).join('\n') || 'No stack available';
    
    const mountData = {
      mountId,
      mountNumber: mountCountRef.current,
      timeSinceLastMount: `${timeSinceLastMount}ms`,
      isSuspiciousRemount: mountCountRef.current > 1 && timeSinceLastMount < 200, // Less than 200ms = suspicious
      
      // Current state
      state: {
        isConnected,
        actualSessionId,
        finalSessionId,
        roomId,
        userId: currentUser?.id,
        isHost,
        hasSessionStatus: !!sessionStatus,
        hasSendMessage: !!sendMessage,
        userSeatsCount: Object.keys(userSeats || {}).length,
        messagesLength: messages?.length,
        timestamp: new Date().toISOString()
      },
      
      // Trigger detection
      triggers,
      triggersDetected: Object.entries(triggers).filter(([_, t]) => t.changed).map(([key]) => key),
      
      // Stack trace
      stackTrace
    };
    
    logger.debug('🎬 [PositionCalculatorPage] Component MOUNTED', mountData);
    
    // ⚠️ Log suspicious rapid remounts
    // NOTE: React 18 Strict Mode intentionally remounts components in development
    // to help detect side effects. This is NORMAL and only happens in dev mode.
    // In production, components mount once. See: https://react.dev/reference/react/StrictMode
    if (mountData.isSuspiciousRemount) {
      console.warn('⚠️⚠️⚠️ [SUSPICIOUS REMOUNT] Component remounted <200ms after last mount!', {
        mountNumber: mountCountRef.current,
        timeSinceLastMount: `${timeSinceLastMount}ms`,
        triggers: mountData.triggersDetected,
        stackTrace,
        note: 'This is usually React Strict Mode in development (NORMAL behavior)'
      });
      
      // Send to backend for aggregation
      fetch('http://localhost:8080/api/diagnostics/remount-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component: 'PositionCalculatorPage',
          mountNumber: mountCountRef.current,
          timeSinceLastMount,
          triggers: mountData.triggersDetected,
          roomId,
          sessionId: actualSessionId,
          userId: currentUser?.id,
          stackTrace,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.log('📊 [Diagnostics] Failed to send remount log:', err.message));
    }
    
    // Store current values for next comparison
    prevPropsRef.current = {
      sessionStatus,
      roomId,
      sessionId: actualSessionId,
      isConnected,
      messagesLength: messages?.length
    };
    
    // Return cleanup function to log unmount
    return () => {
      const unmountDuration = Date.now() - mountTimestampRef.current;
      logger.debug('👋 [PositionCalculatorPage] Component UNMOUNTING', {
        mountId,
        mountNumber: mountCountRef.current,
        wasMountedFor: `${unmountDuration}ms`,
        roomId,
        sessionId: finalSessionId,
        userId: currentUser?.id,
        isHost,
        currentUserSeats: userSeats,
        currentURL: window.location.href,
        timestamp: new Date().toISOString()
      });
    };
  }, [isConnected, actualSessionId, finalSessionId, roomId, currentUser?.id, sessionStatus, sendMessage]);
  
  // Discussion mode button show/hide on mouse movement (for host only)
  useEffect(() => {
    if (!isHost) return;
    
    const handleMouseMove = () => {
      setShowDiscussionModeButton(true);
      
      // Clear existing timeout
      if (discussionModeHideTimeoutRef.current) {
        clearTimeout(discussionModeHideTimeoutRef.current);
      }
      
      // Hide button after 1 second of no movement
      discussionModeHideTimeoutRef.current = setTimeout(() => {
        setShowDiscussionModeButton(false);
      }, 1000);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (discussionModeHideTimeoutRef.current) {
        clearTimeout(discussionModeHideTimeoutRef.current);
      }
    };
  }, [isHost]);
  
  // 📱 Orientation detection for mobile devices
  useEffect(() => {
    // Check if already dismissed (remember user's choice)
    const hasDismissedOrientation = sessionStorage.getItem('wewatch_orientation_dismissed');
    if (hasDismissedOrientation) return;
    
    // Detect mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;
    
    const checkOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsPortraitMode(isPortrait);
      
      // Show modal only if in portrait mode on mobile and not dismissed
      if (isPortrait && !sessionStorage.getItem('wewatch_orientation_dismissed')) {
        setShowOrientationModal(true);
      } else {
        setShowOrientationModal(false);
      }
    };
    
    // Check on mount
    checkOrientation();
    
    // Listen for orientation changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);
  
  // 🎮 View icons show/hide on mouse movement (3 second auto-hide)
  useEffect(() => {
    const handleMouseMove = () => {
      setShowViewIcons(true);
      
      // Clear existing timeout
      if (viewIconsHideTimeoutRef.current) {
        clearTimeout(viewIconsHideTimeoutRef.current);
      }
      
      // Hide icons after 3 seconds of no movement
      viewIconsHideTimeoutRef.current = setTimeout(() => {
        setShowViewIcons(false);
      }, 3000);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (viewIconsHideTimeoutRef.current) {
        clearTimeout(viewIconsHideTimeoutRef.current);
      }
    };
  }, []);
  
  // ✅ Fetch temporary media items when sessionId changes
  useEffect(() => {
    const fetchTemporaryMedia = async () => {
      if (!actualSessionId) {
        console.log('📥 [PositionCalculatorPage] No actualSessionId, skipping temporary media fetch');
        return;
      }
      
      try {
        console.log(`📥 [PositionCalculatorPage] Fetching temporary media for session ${actualSessionId}`);
        const items = await getSessionTemporaryMedia(actualSessionId);
        console.log(`📥 [PositionCalculatorPage] Fetched ${items.length} temporary media items:`, items);
        setTemporaryPlaylist(items);
      } catch (error) {
        console.error('❌ [PositionCalculatorPage] Failed to fetch temporary media:', error);
        // Don't show toast - just log error. Playlist stays empty.
      }
    };
    
    fetchTemporaryMedia();
  }, [actualSessionId]);
  
  // ✅ Handle upload complete - refresh temporary playlist
  const handleUploadComplete = useCallback(async () => {
    console.log('📤 [PositionCalculatorPage] Upload complete, refreshing temporary playlist...');
    if (!actualSessionId) {
      console.log('📤 [PositionCalculatorPage] No actualSessionId, cannot refresh');
      return;
    }
    
    try {
      const items = await getSessionTemporaryMedia(actualSessionId);
      console.log(`📤 [PositionCalculatorPage] Refreshed playlist: ${items.length} items`, items);
      setTemporaryPlaylist(items);
      toast.success('Media uploaded successfully!');
    } catch (error) {
      console.error('❌ [PositionCalculatorPage] Failed to refresh playlist:', error);
      toast.error('Upload succeeded but failed to refresh playlist');
    }
  }, [actualSessionId]);
  
  // ✅ Fetch watch session members from backend
  const prevMembersRef = useRef([]);
  const fetchWatchSessionMembers = useCallback(async () => {
    console.log('🔄 [fetchWatchSessionMembers] Called with:', { actualRoomId, actualSessionId });
    if (!actualRoomId || !actualSessionId) {
      console.warn('⚠️ [fetchWatchSessionMembers] Skipping - missing roomId or sessionId');
      return;
    }
    
    try {
      console.log('📡 [fetchWatchSessionMembers] Calling getActiveSession for room:', actualRoomId);
      const response = await getActiveSession(actualRoomId);
      console.log('📥 [fetchWatchSessionMembers] API Response:', response.data);
      const sessionMembers = response.data?.members || [];
      
      // Only log if members changed
      const membersChanged = JSON.stringify(sessionMembers) !== JSON.stringify(prevMembersRef.current);
      if (membersChanged) {
        console.log('👥 [Watch Session Members] CHANGED:', {
          count: sessionMembers.length,
          members: sessionMembers.map(m => ({ id: m.user_id, username: m.username, isActive: m.is_active }))
        });
        prevMembersRef.current = sessionMembers;
      }
      
      // Update userIdToUsername mapping
      const usernameUpdates = {};
      sessionMembers.forEach(member => {
        if (member.username) {
          usernameUpdates[member.user_id] = member.username;
        }
      });
      if (Object.keys(usernameUpdates).length > 0) {
        setUserIdToUsername(prev => ({ ...prev, ...usernameUpdates }));
      }
      
      // Update watchSessionMembers
      setWatchSessionMembers(sessionMembers.map(member => ({
        id: member.user_id,
        username: member.username || `User ${member.user_id}`,
        user_role: member.user_role,
        is_active: member.is_active,
        avatar_url: member.avatar_url || null
      })));
      
      // Mark that we've successfully fetched members from API
      hasApiFetchedMembersRef.current = true;
    } catch (error) {
      console.error('❌ [Watch Session Members] Fetch failed:', error);
    }
  }, [actualRoomId, actualSessionId]);
  
  // ⚠️ API polling DISABLED - WebSocket session_status provides real-time member data
  // fetchWatchSessionMembers function kept for manual refresh fallback if needed
  // useEffect(() => {
  //   fetchWatchSessionMembers();
  //   // Poll every 5 seconds for member updates
  //   const interval = setInterval(fetchWatchSessionMembers, 5000);
  //   return () => clearInterval(interval);
  // }, [fetchWatchSessionMembers]);
  
  // Populate watchSessionMembers from sessionStatus, using userIdToUsername mapping
  useEffect(() => {
    // console.log('👥 [watchSessionMembers useEffect] TRIGGERED');
    // console.log('👥 [watchSessionMembers useEffect] sessionStatus:', JSON.stringify(sessionStatus, null, 2));
    // console.log('👥 [watchSessionMembers useEffect] sessionStatus.members:', sessionStatus?.members);
    // console.log('👥 [watchSessionMembers useEffect] seating data:', sessionStatus?.seating);
    if (sessionStatus?.members && Array.isArray(sessionStatus.members)) {
      // Deduplicate members by user_id (safety net for backend duplicates)
      const uniqueMembers = sessionStatus.members.reduce((acc, member) => {
        if (!acc.find(m => m.user_id === member.user_id)) {
          acc.push(member);
        }
        return acc;
      }, []);
      
      // console.log('👥 [watchSessionMembers useEffect] uniqueMembers:', uniqueMembers);
      // console.log('👥 [watchSessionMembers useEffect] userIdToUsername:', userIdToUsername);
      
      // ✅ Populate userIdToUsername from session_status members (includes username now)
      const usernameUpdates = {};
      uniqueMembers.forEach(member => {
        if (member.username) {
          usernameUpdates[member.user_id] = member.username;
        }
      });
      if (Object.keys(usernameUpdates).length > 0) {
        // console.log('👥 [watchSessionMembers useEffect] Adding usernames:', usernameUpdates);
        setUserIdToUsername(prev => ({ ...prev, ...usernameUpdates }));
      }
      
      setWatchSessionMembers(uniqueMembers.map(member => ({
        id: member.user_id,
        username: member.username || userIdToUsername[member.user_id] || `User ${member.user_id}`,
        user_role: member.user_role,
        avatar_url: member.avatar_url || null
      })));
    } else {
      console.warn('⚠️ [watchSessionMembers useEffect] No members array in sessionStatus');
    }
  }, [sessionStatus?.members]);
  
  // ✅ FIX: Fallback - Populate watchSessionMembers from userSeats when sessionStatus is empty
  useEffect(() => {
    // Only use fallback if sessionStatus doesn't provide members AND we haven't fetched from API
    if (sessionStatus?.members && Array.isArray(sessionStatus.members) && sessionStatus.members.length > 0) {
      return; // Backend data available, skip fallback
    }
    
    // Don't overwrite API-fetched members with fallback
    if (hasApiFetchedMembersRef.current) {
      return; // Already have members from API polling, don't overwrite
    }
    
    // Build members list from userSeats mapping
    const userIds = Object.keys(userSeats);
    if (userIds.length === 0) {
      // console.log('👥 [watchSessionMembers FALLBACK] No users in userSeats yet');
      return;
    }
    
    const members = userIds.map(userId => {
      const userIdNum = parseInt(userId);
      return {
        id: userIdNum,
        username: userIdToUsername[userIdNum] || `User ${userIdNum}`,
        user_role: (userIdNum === roomHostId || userIdNum === sessionStatus?.hostId) ? 'host' : 'member'
      };
    });
    
    // Only log if members list actually changed
    if (JSON.stringify(members.map(m => m.id)) !== JSON.stringify(watchSessionMembers.map(m => m.id))) {
      console.log('👥 [watchSessionMembers FALLBACK] Built from userSeats:', members);
    }
    setWatchSessionMembers(members);
  }, [userSeats, userIdToUsername, sessionStatus?.members, roomHostId, sessionStatus?.hostId]);

  // ✅ Save quizzes to sessionStorage when they change
  useEffect(() => {
    if (quizzes.length > 0) {
      sessionStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(quizzes));
      console.log('💾 [Quiz Persistence] Saved quizzes to sessionStorage:', quizzes.length);
    }
  }, [quizzes]);

  // ✅ Save activeQuiz to sessionStorage when it changes
  useEffect(() => {
    if (activeQuiz) {
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_QUIZ, JSON.stringify(activeQuiz));
      console.log('💾 [Quiz Persistence] Saved activeQuiz to sessionStorage:', activeQuiz.id);
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_QUIZ);
    }
  }, [activeQuiz]);

  // ✅ Save quizResults to sessionStorage when they change
  useEffect(() => {
    if (quizResults) {
      sessionStorage.setItem(STORAGE_KEYS.QUIZ_RESULTS, JSON.stringify(quizResults));
      console.log('💾 [Quiz Persistence] Saved quizResults to sessionStorage');
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.QUIZ_RESULTS);
    }
  }, [quizResults]);

  // ✅ Save quizProgress to sessionStorage when it changes
  useEffect(() => {
    if (quizProgress) {
      sessionStorage.setItem(STORAGE_KEYS.QUIZ_PROGRESS, JSON.stringify(quizProgress));
      console.log('💾 [Quiz Persistence] Saved quizProgress to sessionStorage');
    }
  }, [quizProgress]);

  // ✅ Save quizHistory to sessionStorage when it changes
  useEffect(() => {
    if (quizHistory && (quizHistory.active_quizzes?.length > 0 || quizHistory.completed_submissions?.length > 0)) {
      sessionStorage.setItem(STORAGE_KEYS.QUIZ_HISTORY, JSON.stringify(quizHistory));
      console.log('💾 [Quiz Persistence] Saved quizHistory to sessionStorage');
    }
  }, [quizHistory]);

  // ✅ Restore quiz state from sessionStorage on mount
  useEffect(() => {
    const restoreQuizState = () => {
      try {
        const savedQuizzes = sessionStorage.getItem(STORAGE_KEYS.QUIZZES);
        const savedActiveQuiz = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_QUIZ);
        const savedQuizResults = sessionStorage.getItem(STORAGE_KEYS.QUIZ_RESULTS);
        const savedQuizProgress = sessionStorage.getItem(STORAGE_KEYS.QUIZ_PROGRESS);
        const savedQuizHistory = sessionStorage.getItem(STORAGE_KEYS.QUIZ_HISTORY);

        if (savedQuizzes) {
          setQuizzes(JSON.parse(savedQuizzes));
          console.log('♻️ [Quiz Persistence] Restored quizzes from sessionStorage');
        }
        if (savedActiveQuiz) {
          setActiveQuiz(JSON.parse(savedActiveQuiz));
          console.log('♻️ [Quiz Persistence] Restored activeQuiz from sessionStorage');
        }
        if (savedQuizResults) {
          setQuizResults(JSON.parse(savedQuizResults));
          console.log('♻️ [Quiz Persistence] Restored quizResults from sessionStorage');
        }
        if (savedQuizProgress) {
          setQuizProgress(JSON.parse(savedQuizProgress));
          console.log('♻️ [Quiz Persistence] Restored quizProgress from sessionStorage');
        }
        if (savedQuizHistory) {
          setQuizHistory(JSON.parse(savedQuizHistory));
          console.log('♻️ [Quiz Persistence] Restored quizHistory from sessionStorage');
        }
      } catch (err) {
        console.warn('⚠️ [Quiz Persistence] Failed to restore quiz state:', err);
      }
    };

    restoreQuizState();
  }, []); // Run once on mount

  // ✅ Request quiz history via WebSocket on session join (for late joiners)
  useEffect(() => {
    if (actualSessionId && currentUser?.id && sendMessage) {
      console.log('📥 [Quiz Join] Requesting quiz history for late joiner...');
      
      // Small delay to ensure WebSocket is ready
      setTimeout(() => {
        sendMessage({
          type: 'quiz_history_request',
          data: { session_id: actualSessionId }
        });
        console.log('✅ [Quiz Join] Quiz history request sent');
      }, 500);
    }
  }, [actualSessionId, currentUser?.id, sendMessage]);

  // ✅ Fetch quiz data from backend API on mount (after sessionStorage restore)
  useEffect(() => {
    const fetchQuizData = async () => {
      if (!actualSessionId || !currentUser?.id) return;

      try {
        const token = sessionStorage.getItem('wewatch_ws_token');
        if (!token) {
          console.warn('⚠️ [Quiz Fetch] No auth token found');
          return;
        }

        console.log('📥 [Quiz Fetch] Fetching quiz data from backend...');

        // Fetch quizzes list (host view)
        if (isHost) {
          const quizzesResponse = await fetch(`${API_BASE_URL}/api/quizzes/session/${actualSessionId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (quizzesResponse.ok) {
            const quizzesData = await quizzesResponse.json();
            if (quizzesData && Array.isArray(quizzesData)) {
              setQuizzes(quizzesData);
              console.log('✅ [Quiz Fetch] Loaded quizzes:', quizzesData.length);
              
              // Find active quiz
              const activeQuizData = quizzesData.find(q => q.status === 'in_progress');
              if (activeQuizData) {
                setActiveQuiz(activeQuizData);
                console.log('✅ [Quiz Fetch] Found active quiz:', activeQuizData.id);
              }
            }
          } else {
            console.warn('⚠️ [Quiz Fetch] Failed to fetch quizzes:', quizzesResponse.status);
          }
        } else {
          // Student: Fetch quiz history
          const historyResponse = await fetch(`${API_BASE_URL}/api/quizzes/session/${actualSessionId}/history`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            if (historyData) {
              setQuizHistory(historyData);
              console.log('✅ [Quiz Fetch] Loaded quiz history:', historyData);
              
              // If there's an active quiz, fetch it
              if (historyData.active_quizzes && historyData.active_quizzes.length > 0) {
                const activeQuizData = historyData.active_quizzes[0];
                setActiveQuiz(activeQuizData);
                console.log('✅ [Quiz Fetch] Found active quiz for student:', activeQuizData.id);
              }
            }
          } else {
            console.warn('⚠️ [Quiz Fetch] Failed to fetch quiz history:', historyResponse.status);
          }
        }

        // Fetch quiz progress if host viewing active quiz
        if (isHost && activeQuiz?.id) {
          const progressResponse = await fetch(`${API_BASE_URL}/api/quizzes/${activeQuiz.id}/progress`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            if (progressData) {
              setQuizProgress(progressData);
              console.log('✅ [Quiz Fetch] Loaded quiz progress:', progressData);
            }
          }
        }
      } catch (err) {
        console.error('❌ [Quiz Fetch] Error fetching quiz data:', err);
      }
    };

    // Delay fetch to allow sessionStorage restore to complete first
    const timer = setTimeout(fetchQuizData, 1000);
    return () => clearTimeout(timer);
  }, [actualSessionId, currentUser?.id, isHost]);

  // Fetch user's token balance for donation system
  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!currentUser?.id) return;
      
      try {
        const response = await apiClient.get('/api/wallets/me');
        if (response.data?.balance !== undefined) {
          setTokenBalance(response.data.balance);
        }
      } catch (error) {
        console.error('❌ [TokenBalance] Failed to fetch wallet balance:', error);
        setTokenBalance(0); // Fallback to 0 on error
      }
    };

    fetchTokenBalance();
  }, [currentUser?.id]);

  // Request fresh seat state after WebSocket connects
  useEffect(() => {
    logger.debug('🎯 [RequestSeatState] useEffect triggered', {
      isConnected,
      hasSendMessage: !!sendMessage,
      actualSessionId,
      hasSeatAssigned,
      willSendRequest: !!(isConnected && sendMessage && actualSessionId && !hasSeatAssigned)
    });
    
    // Don't request seat or show spinner if already seated
    if (hasSeatAssigned) {
      logger.debug('⏭️ [RequestSeatState] Already seated - skipping request');
      return;
    }
    
    if (isConnected && sendMessage && actualSessionId) {
      logger.debug('✅ [RequestSeatState] Conditions met - sending request_seat_state in 500ms');
      
      // Small delay to ensure backend is ready
      const timer = setTimeout(() => {
        logger.debug('📤 [RequestSeatState] NOW SENDING request_seat_state message');
        sendMessage({ type: 'request_seat_state' });
      }, 500);
      return () => clearTimeout(timer);
    } else {
      logger.debug('⚠️ [RequestSeatState] Conditions NOT met - NOT sending request');
    }
  }, [isConnected, sendMessage, actualSessionId, enableLoadingOverlay, hasSeatAssigned]);

  // Sync userSeats from session_status seating data (for users who joined late)
  useEffect(() => {
    if (sessionStatus?.seating && typeof sessionStatus.seating === 'object') {
      console.log('🔄 [Sync Seats] Processing seating from session_status:', sessionStatus.seating);
      
      // ✅ Backend always sends {userId: seatId} format
      // Convert all values to strings for consistency (backend may send numbers)
      const newUserSeats = {};
      Object.entries(sessionStatus.seating).forEach(([userId, seatId]) => {
        newUserSeats[userId] = String(seatId);
      });
      
      console.log('🔄 [Sync Seats] Converted to userId→seatId:', newUserSeats);
      setUserSeats(prev => ({
        ...prev,
        ...newUserSeats
      }));
    }
  }, [sessionStatus?.seating]);
  
  // Handle session ended (from backend)
  useEffect(() => {
    // Only redirect if session explicitly ended with error, NOT if there was never a session
    if (sessionStatus?.error === 'session_ended') {
      console.log('📛 [PositionCalculator] Session ended via sessionStatus');
      toast.error('Lecture hall session has ended');
      
      // ✅ Redirect based on room type: lobby for instant watch, room page for persistent
      const redirectPath = isInstantWatch ? '/lobby' : `/rooms/${roomId}`;
      console.log(`🧭 [PositionCalculator] Redirecting to ${redirectPath} (instant watch: ${isInstantWatch})`);
      
      setTimeout(() => {
        navigate(redirectPath);
      }, 2000);
    }
  }, [sessionStatus?.error, roomId, navigate, isInstantWatch]);
  
  // ✅ Auto-load generated lecture hall seats from JSON file
  const loadSeatsInitialized = useRef(false);
  useEffect(() => {
    if (!loadSeatsInitialized.current && previewSeats.length === 0) {
      console.log('🎯 [PositionCalculator] Loading lecture hall seats from JSON file');
      loadSeatsInitialized.current = true;
      
      // ✅ Try sessionStorage cache first (pre-loaded by RoomPageNew)
      const cachedSeats = sessionStorage.getItem('lecture_hall_seats');
      if (cachedSeats) {
        try {
          const data = JSON.parse(cachedSeats);
          console.log('⚡ [PositionCalculator] Using cached lecture hall seats:', data.length, 'seats');
          const seats = data.map(seat => ({
            ...seat,
            isHost: seat.id === 145
          }));
          setPreviewSeats(seats);
          
          // ✅ Start at user's current seat, not seat 0
          const userCurrentSeatId = userSeats[currentUser?.id];
          if (userCurrentSeatId) {
            console.log('👤 [PositionCalculator] User has seat:', userCurrentSeatId);
            setActiveSeatIndex(userCurrentSeatId - 1);
          }
          // ⚠️ DON'T auto-show seat cycling modal for members
          // setShowSeatCycling(true); // Removed - only for dev/testing
          return;
        } catch (err) {
          console.warn('⚠️ [PositionCalculator] Failed to parse cached seats, fetching fresh:', err);
        }
      }
      
      // Fallback: Load from public/data/lecture_hall_seats.json
      console.log('📥 [PositionCalculator] No cache, fetching seats from /data/lecture_hall_seats.json');
      fetch('/data/lecture_hall_seats.json')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          console.log('📄 [PositionCalculator] Raw JSON data:', data.length, 'seats');
          
          // ✅ Cache for future use
          sessionStorage.setItem('lecture_hall_seats', JSON.stringify(data));
          console.log('💾 [PositionCalculator] Cached seats to sessionStorage');
          
          // The JSON already has the correct structure: {id, position, row, column}
          // Just add isHost flag
          const seats = data.map(seat => ({
            ...seat, // Keep all properties (id, position, row, column, seatInRow)
            isHost: seat.id === 145
          }));
          console.log('✅ [PositionCalculator] Loaded', seats.length, 'lecture hall seats from JSON');
          console.log('📍 [PositionCalculator] Sample seats:', { 
            seat1: seats[0], 
            seat2: seats[1],
            seat145: seats.find(s => s.id === 145)
          });
          console.log('👥 [PositionCalculator] Current userSeats at seat load time:', userSeats);
          setPreviewSeats(seats);
          // ✅ Start at user's current seat, not seat 0
          const userCurrentSeatId = userSeats[currentUser?.id];
          const userSeatIndex = seats.findIndex(s => s.id === userCurrentSeatId);
          console.log('🎓 [K] User seat:', userCurrentSeatId, 'Index:', userSeatIndex);
          setCurrentSeatIndex(userSeatIndex >= 0 ? userSeatIndex : 0);
          // ⚠️ DON'T auto-show seat cycling modal for members
          // setShowSeatCycling(true); // Removed - only for dev/testing
        })
        .catch(err => {
          console.error('❌ [PositionCalculator] Failed to load seats JSON, using fallback generation:', err);
          // Fallback: inline the seat generation
          const generatedSeats = [];
      let seatId = 1;
      const seatsToRaise = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134];
      
      // Seating arrangement parameters
      const startZ = -48.844;
      const rowSpacingZ = -5.6;
      const startY = 5.274;
      const rowSpacingY = 0.95;
      
      // Column 1: 5 seats per row, 8 rows (seats 1-40)
      const col1_row1 = [-39.376, -29.394, -19.296, -9.444, 0.591];
      const col1_row2 = [-39.532, -29.266, -19.408, -9.598, 0.465];
      const col1_x = col1_row1.map((x, i) => (x + col1_row2[i]) / 2);
      
      for (let row = 0; row < 8; row++) {
        const z = startZ + (row * rowSpacingZ);
        let y = startY + (row * rowSpacingY);
        const zVariation = (row % 2) * 0.5;
        if (row >= 6) y = y * 1.1;
        
        for (let seat = 0; seat < 5; seat++) {
          const currentSeatId = seatId;
          let finalY = y;
          if (seatsToRaise.includes(currentSeatId)) finalY = y * 1.1;
          generatedSeats.push({ id: seatId++, position: [col1_x[seat], finalY, z + zVariation] });
        }
      }
      
      // Column 2: 8 seats per row, 8 rows (seats 41-104)
      const col2_row1 = [10.644, 20.472, 30.485, 40.379, 50.341, 60.364, 70.347, 80.346];
      const col2_row2 = [10.435, 20.559, 30.574, 40.485, 50.446, 60.346, 70.347, 80.346];
      const col2_x = col2_row1.map((x, i) => (x + col2_row2[i]) / 2);
      
      for (let row = 0; row < 8; row++) {
        const z = startZ + (row * rowSpacingZ);
        let y = startY + (row * rowSpacingY);
        const zVariation = (row % 2) * 0.5;
        if (row >= 6) y = y * 1.1;
        
        for (let seat = 0; seat < 8; seat++) {
          const currentSeatId = seatId;
          let finalY = y;
          if (seatsToRaise.includes(currentSeatId)) finalY = y * 1.1;
          generatedSeats.push({ id: seatId++, position: [col2_x[seat], finalY, z + zVariation] });
        }
      }
      
      // Column 3: 5 seats per row, 8 rows (seats 105-144)
      const col3_row1 = [96.629, 107.578, 117.611, 127.561, 138.635];
      const col3_row2 = [96.344, 106.439, 117.471, 128.441, 139.432];
      const col3_x = col3_row1.map((x, i) => (x + col3_row2[i]) / 2);
      
      for (let row = 0; row < 8; row++) {
        const z = startZ + (row * rowSpacingZ);
        let y = startY + (row * rowSpacingY);
        const zVariation = (row % 2) * 0.5;
        if (row >= 6) y = y * 1.1;
        
        for (let seat = 0; seat < 5; seat++) {
          const currentSeatId = seatId;
          let finalY = y;
          if (seatsToRaise.includes(currentSeatId)) finalY = y * 1.1;
          generatedSeats.push({ id: seatId++, position: [col3_x[seat], finalY, z + zVariation] });
        }
      }
      
      // Host/Teacher seat (seat 145)
      generatedSeats.push({ id: 145, position: [7.121, 18.737, -229.244], isHost: true });
      
      setPreviewSeats(generatedSeats);
      // ⚠️ DON'T auto-show seat cycling modal for members
      // setShowSeatCycling(true); // Removed - only for dev/testing
      // ✅ Start at user's current seat, not seat 0
      const userCurrentSeatId = userSeats[currentUser?.id];
      const userSeatIndex = generatedSeats.findIndex(s => s.id === userCurrentSeatId);
      console.log('🎓 [Generate Seats] User seat:', userCurrentSeatId, 'Index:', userSeatIndex);
      setCurrentSeatIndex(userSeatIndex >= 0 ? userSeatIndex : 0);
        });
    }
  }, [previewSeats.length]); // Run when previewSeats changes
  
  // 🎯 Watch Type Detection (for selective subscription logic)
  const watchType = sessionStatus?.watch_type || (
    modelType === 'lecture-hall' ? 'classroom' : null
  );
  const classType = sessionStatus?.class_type || 'lecture_hall';
  const isLectureHall = watchType === 'classroom' && classType === 'lecture_hall';

  // Removed verbose Watch Type Detection log (was appearing 100+ times per session)

  // Audio management with raise hand system
  const {
    hasMicPermission,
    isAudioActive,
    localStream,
    audioDevices,
    selectedAudioDeviceId,
    discussionMode,
    setDiscussionMode,
    requestMicPermission,
    toggleAudio,
    changeAudioDevice,
    getAudioRecipients,
    toggleDiscussionMode,
    getRowFromSeatId,
  } = useLectureHallAudio({
    isHost: isHost,
    hasHostApproval,
    userSeats,
    authenticatedUserID: currentUser?.id,
    watchSessionMembers,
    approvedSpeakers,
    sendMessage,
    sessionId: finalSessionId,
    lectureHallSeats: EMPTY_LECTURE_HALL_SEATS, // ✅ Stable reference - prevents getRowFromSeatId recreation
  });
  
  // LiveKit audio streaming
  // 🎯 autoSubscribe logic:
  //   - Discussion mode: true (everyone hears everyone)
  //   - Lecture hall default: false (selective row-based subscription)
  //   - Other watch types: true (normal behavior)
  const shouldAutoSubscribe = !isLectureHall || discussionMode;
  
  // 🔍 DEBUG: Log autoSubscribe decision
  useEffect(() => {
    console.log('🎛️ [AUTO-SUBSCRIBE CONFIG]', {
      isLectureHall,
      discussionMode,
      shouldAutoSubscribe,
      mode: isLectureHall ? (discussionMode ? 'DISCUSSION' : 'LECTURE_DEFAULT') : 'OTHER_WATCH_TYPE'
    });
  }, [isLectureHall, discussionMode, shouldAutoSubscribe]);
  
  const {
    room: livekitRoom,
    localParticipant,
    remoteParticipants,
    isConnected: isLivekitConnected,
    connect: connectLivekit,
    disconnect: disconnectLivekit
  } = useLiveKitRoom(actualRoomId, currentUser, shouldAutoSubscribe);
  
  // ✅ MUTE FIX: Declare audioPublicationRef BEFORE handleToggleAudio uses it
  const audioPublicationRef = useRef(null);
  
  // ✅ MUTE FIX: Track intended mute state synchronously (avoids async isMuted confusion)
  const intendedMuteStateRef = useRef(true); // Start muted
  
  // Wrapper that controls LiveKit publication (track.mute/unmute)
  const handleToggleAudio = useCallback(() => {
    const publication = audioPublicationRef.current;
    
    if (!publication) {
      intendedMuteStateRef.current = !intendedMuteStateRef.current;
      toggleAudio();
      return;
    }
    
    const currentlyMuted = intendedMuteStateRef.current;
    const targetMuted = !currentlyMuted;
    
    console.log(`🎤 [Audio] ${targetMuted ? 'Muting' : 'Unmuting'} microphone`);
    
    
    if (targetMuted) {
      publication.track.mute();
    } else {
      const livekitTrack = publication.track;
      
      // Ensure MediaStreamTrack is enabled
      if (livekitTrack.mediaStreamTrack) {
        livekitTrack.mediaStreamTrack.enabled = true;
      }
      
      if (localStream && localStream.getAudioTracks().length > 0) {
        const mediaTrack = localStream.getAudioTracks()[0];
        if (!mediaTrack.enabled) {
          mediaTrack.enabled = true;
        }
      }
      
      livekitTrack.unmute();
    }
    
    intendedMuteStateRef.current = targetMuted;
    toggleAudio();
  }, [audioPublicationRef, toggleAudio]);
  
  // Seat swap functionality
  const {
    seatSwapRequest,
    handleSeatSwapMessage,
    sendSwapRequest,
    acceptSwap,
    declineSwap
  } = useSeatSwap({
    sendMessage,
    currentUser,
    onSwapAccepted: (data) => {
      console.log('🔄 Seat swap accepted:', data);
      
      // ✅ Update userSeats map for EVERYONE (requester, target, AND observers)
      setUserSeats(prev => {
        const updated = { ...prev };
        // Requester gets target's old seat
        updated[data.requester_id] = String(data.target_seat);
        // Target gets requester's old seat
        updated[data.target_id] = String(data.requester_seat);
        console.log('🗺️ [Swap Accepted] Updated userSeats for ALL users:', updated);
        return updated;
      });
      
      // Determine new seat for current user (if I'm involved in the swap)
      let newSeatId;
      if (data.requester_id === currentUser?.id) {
        // I was the requester, I get the target's seat
        newSeatId = data.target_seat;
      } else if (data.target_id === currentUser?.id) {
        // I was the target, I get the requester's seat
        newSeatId = data.requester_seat;
      }
      
      if (newSeatId) {
        // Convert to integer if string
        const seatIdInt = typeof newSeatId === 'string' ? parseInt(newSeatId, 10) : newSeatId;
        console.log('🪑 [Swap Accepted] My new seat:', seatIdInt);
        
        // Update local seat
        const newSeat = getLectureHallSeatById(seatIdInt);
        if (newSeat) {
          setCurrentSeat(newSeat);
          console.log('✅ [Swap Accepted] Updated currentSeat to:', newSeat);
        }
      }
      
      toast.success('Seat swap completed!');
    }
  });
  
  // Connect to LiveKit when room and user are ready (run once)
  const hasAttemptedConnection = useRef(false);
  
  useEffect(() => {
    if (!actualRoomId || !currentUser || !isConnected) {
      console.log('⏳ [LiveKit] Waiting for room/user/connection...', { actualRoomId, currentUser: !!currentUser, isConnected });
      return;
    }
    
    // Only attempt connection once
    if (hasAttemptedConnection.current) {
      console.log('⏸️ [LiveKit] Connection already attempted');
      return;
    }
    
    hasAttemptedConnection.current = true;
    console.log('🔗 [LiveKit] Initiating connection for room:', actualRoomId);
    connectLivekit();
    
    // Cleanup only on unmount
    return () => {
      console.log('🔌 [LiveKit] Component unmounting, disconnecting...');
      disconnectLivekit();
      hasAttemptedConnection.current = false;
    };
  }, [actualRoomId, currentUser?.id, isConnected, connectLivekit, disconnectLivekit]);
  
  // ✅ audioPublicationRef moved earlier (now before handleToggleAudio)
  // (was here, but moved up to line ~1258 to fix initialization order)
  
  // 🎧 [AUDIO ELEMENTS] Stable storage for audio elements (survives remounts)
  const audioElementsRef = useRef(new Map()); // Map<participantIdentity, HTMLAudioElement>
  
  // 📦 [STABLE STATE] Refs for frequently changing state (prevents effect remounts)
  const userSeatsRef = useRef(userSeats);
  const approvedSpeakersRef = useRef(approvedSpeakers);
  const discussionModeRef = useRef(discussionMode);
  const currentUserIdRef = useRef(currentUser?.id);
  const isHostRef = useRef(isHost);
  
  // Keep refs in sync with state
  useEffect(() => {
    userSeatsRef.current = userSeats;
  }, [userSeats]);
  
  useEffect(() => {
    approvedSpeakersRef.current = approvedSpeakers;
  }, [approvedSpeakers]);
  
  useEffect(() => {
    discussionModeRef.current = discussionMode;
  }, [discussionMode]);
  
  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);
  
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  
  useEffect(() => {
    if (!livekitRoom || !localStream || !isLivekitConnected) {
      console.log('⏳ [LiveKit Audio] Waiting...', { 
        hasRoom: !!livekitRoom, 
        hasStream: !!localStream, 
        isConnected: isLivekitConnected,
        isAudioActive 
      });
      return;
    }
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn('⚠️ [LiveKit Audio] No audio track in localStream');
      return;
    }
    
    // 🎓 [LECTURE HALL MODE] Publish track ONCE, control mute state via publication
    console.log('🔐 [LiveKit] Watch Type:', {
      watchType,
      classType,
      isLectureHall,
      isHost,
      hasHostApproval,
      discussionMode,
      isAudioActive
    });
    
    // Publish track once if not already published
    if (!audioPublicationRef.current) {
      console.log('\n🟢 [LiveKit PUBLISH] Publishing audio track to LiveKit (ONCE)');
      console.log('  Track ID:', audioTrack.id);
      console.log('  Track enabled:', audioTrack.enabled);
      console.log('  User role:', isHost ? 'HOST' : hasHostApproval ? 'APPROVED_SPEAKER' : 'MEMBER');
      
      livekitRoom.localParticipant.publishTrack(audioTrack, {
        source: 'microphone',
        name: 'microphone',
      })
        .then((publication) => {
          audioPublicationRef.current = publication;
          
          // ✅ MUTE FIX: Mute the track by default (stops sending to server)
          publication.track.mute();
          intendedMuteStateRef.current = true; // Sync our ref
          
          console.log('✅ [LiveKit PUBLISH SUCCESS] Track published:', publication.trackSid);
          console.log('  Track.enabled:', audioTrack.enabled);
          console.log('  ✅ [MUTE FIX] track.mute() called - server-side muted');
          console.log('  ✅ [MUTE FIX] intendedMuteStateRef synced to: true');
          console.log('  Publication details:', {
            isMuted: publication.isMuted,
            isSubscribed: publication.isSubscribed,
            kind: publication.kind,
            source: publication.source,
          });
        })
        .catch(err => {
          console.error('❌ [LiveKit] Failed to publish audio:', err);
          toast.error('Failed to publish audio');
        });
    } else {
      // Track already published - mute control happens via track.enabled in useLectureHallAudio
      // LiveKit automatically syncs track.enabled state to server
      console.log('🔊 [LiveKit] Track already published. Current track.enabled:', audioTrack.enabled);
      
      // 🔍 PHASE 1: Detailed state logging when audio state changes
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎤 [PHASE 1 DEBUG] Audio State Change Detected');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📍 User Info:');
      console.log('   ID:', currentUser?.id);
      console.log('   Seat:', currentSeat?.id, '(Row', currentSeat?.row + ')');
      console.log('   Role:', isHost ? '👨‍🏫 HOST' : hasHostApproval ? '📢 APPROVED' : '🎓 STUDENT');
      console.log('\n🎙️ Local Audio State:');
      console.log('   isAudioActive:', isAudioActive, isAudioActive ? '✅ UNMUTED' : '🔇 MUTED');
      console.log('   audioTrack.enabled:', audioTrack.enabled);
      console.log('   audioTrack.muted:', audioTrack.muted);
      console.log('   audioTrack.readyState:', audioTrack.readyState);
      console.log('\n📡 LiveKit Publication:');
      console.log('   publication.isMuted:', audioPublicationRef.current?.isMuted, 
        audioPublicationRef.current?.isMuted ? '🔇 SERVER MUTED' : '🔊 SERVER UNMUTED');
      console.log('   publication.trackSid:', audioPublicationRef.current?.trackSid);
      console.log('\n🔍 MUTE FIX STATUS:');
      const isInSync = audioPublicationRef.current?.isMuted === !audioTrack.enabled;
      console.log('   Sync Status:', isInSync ? '✅ IN SYNC' : '⚠️ OUT OF SYNC');
      if (!isInSync) {
        console.log('   ⚠️ WARNING: publication.isMuted should match !track.enabled');
        console.log('   Expected: publication.isMuted =', !audioTrack.enabled);
        console.log('   Actual: publication.isMuted =', audioPublicationRef.current?.isMuted);
      }
      console.log('\n🎯 Expected Recipients:', getAudioRecipients?.()?.length || 0, 'users');
      if (isHost) {
        console.log('   Scope: 🌐 ALL students (host always broadcasts to everyone)');
      } else if (hasHostApproval) {
        console.log('   Scope: 🌐 ALL users (approved speaker)');
      } else {
        console.log('   Scope: 📍 Row', currentSeat?.row, 'only (~8-18 students)');
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    
    // Cleanup: unpublish only on component unmount
    return () => {
      if (audioPublicationRef.current && audioTrack) {
        console.log('🔇 [LiveKit] Component unmounting - unpublishing audio track');
        
        // ✅ Clear ref IMMEDIATELY to prevent stale reference on fast remount
        const publicationToUnpublish = audioPublicationRef.current;
        audioPublicationRef.current = null;
        
        livekitRoom.localParticipant.unpublishTrack(audioTrack)
          .then(() => {
            console.log('✅ [LiveKit] Audio track unpublished');
          })
          .catch(err => {
            console.error('⚠️ [LiveKit] Error unpublishing track:', err);
          });
      }
    };
  }, [livekitRoom, localStream, isLivekitConnected, isHost, hasHostApproval, watchType, classType, isLectureHall]);
  // ✅ Track published ONCE on mount, stays published forever (LiveKit docs pattern)
  // ⚠️ discussionMode NOT in deps - it only affects subscription logic, not publishing
  // Track mute control via track.enabled only
  
  // 🎓 [AUDIO SUBSCRIPTION] Universal Audio Handler
  // Runs in ALL modes to create audio elements when tracks are subscribed
  // Selective subscription effect controls WHO to subscribe to (via setSubscribed)
  // This effect just creates <audio> elements for subscribed tracks
  useEffect(() => {
    if (!livekitRoom || !isLivekitConnected) {
      return;
    }

    console.log('🟢 [AUTO-SUBSCRIPTION] Active -', 
      isLectureHall 
        ? (discussionMode ? 'Lecture Hall Discussion Mode' : 'Lecture Hall Default Mode')
        : 'Normal Watch Type'
    );

    const handleTrackSubscribed = (track, publication, participant) => {
      // Handle screen share tracks for LiveShare
      if (publication.source === Track.Source.ScreenShare) {
        console.log('✅ [LiveShare] Screen share track subscribed from:', participant.identity);
        
        // ✅ DEBUG: Log LiveKit quality info (simulcast disabled, so only one stream)
        const actualSettings = track.mediaStreamTrack.getSettings();
        console.log('📊 [LIVEKIT QUALITY DEBUG]', {
          trackSid: publication.trackSid,
          dimensions: publication.dimensions,
          simulcasted: publication.simulcasted,
          subscribed: publication.isSubscribed,
          trackSettings: actualSettings,
          actualResolution: `${actualSettings.width}x${actualSettings.height}`
        });
        
        // ⚡ Monitor actual received resolution every 3 seconds
        const qualityMonitor = setInterval(() => {
          const currentSettings = track.mediaStreamTrack.getSettings();
          const currentWidth = currentSettings.width || 0;
          
          console.log(`📊 [QUALITY MONITOR] Receiving: ${currentWidth}x${currentSettings.height}`);
          
          if (currentWidth < 1920 && currentWidth > 0) {
            console.warn(`⚠️ [QUALITY] Receiving ${currentWidth}x${currentSettings.height} - expected 1920x1080`);
          }
        }, 3000);
        
        // Clear monitor when track ends
        track.once('ended', () => {
          clearInterval(qualityMonitor);
          console.log('🛑 [QUALITY MONITOR] Stopped');
        });
        
        const screenStream = new MediaStream([track.mediaStreamTrack]);
        
        console.log('🎬 [LiveShare] Member displaying screen share on blackboard');
        
        // Check if host also has camera track
        const cameraTrackPub = participant.getTrackPublication(Track.Source.Camera);
        let cameraStream = null;
        
        if (cameraTrackPub && cameraTrackPub.track) {
          cameraStream = new MediaStream([cameraTrackPub.track.mediaStreamTrack]);
          console.log('📹 [LiveShare] Host camera track also available');
        }
        
        setBlackboardMedia({
          type: 'liveshare',
          stream: screenStream,
          cameraStream: cameraStream,
          playing: true
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
        
        // Determine liveShareMode based on what tracks are available
        const mode = screenStream && cameraStream ? 'both' : screenStream ? 'screen' : 'camera';
        
        console.log('🎬 [LiveShare] Member displaying camera on blackboard, mode:', mode);
        
        setBlackboardMedia({
          type: 'liveshare',
          stream: screenStream,
          cameraStream: cameraStream,
          playing: true
        });
        
        setLiveShareMode(mode);
        setIsScreenSharingActive(true);
        
        return;
      }
      
      // Handle audio tracks
      if (track.kind !== 'audio') return;

      console.log('🟢 [trackSubscribed]', participant.identity);

      // Check if audio element already exists (prevent duplicates during remounts)
      if (audioElementsRef.current.has(participant.identity)) {
        return;
      }

      // Create and attach audio element
      try {
        const audioElement = track.attach();
        audioElement.autoplay = true;
        audioElement.muted = false; // Explicitly unmute
        audioElement.volume = 1.0; // Max volume
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
        
        // 🔍 CRITICAL DEBUG: Check audio element state BEFORE play()
        console.log('  🎧 [Audio Element State BEFORE play()]', {
          participant: participant.identity,
          paused: audioElement.paused,
          muted: audioElement.muted,
          volume: audioElement.volume,
          readyState: audioElement.readyState,
          src: audioElement.src || 'MediaStream',
          srcObject: !!audioElement.srcObject,
          autoplay: audioElement.autoplay
        });
        
        audioElement.play()
          .then(() => {
            console.log('  ✅ [Audio Element] play() SUCCESS:', participant.identity);
            console.log('    - Now paused?', audioElement.paused);
            console.log('    - Current time:', audioElement.currentTime);
          })
          .catch(err => {
            console.error('  ❌ [Audio] Play failed:', participant.identity, err.message);
            console.error('  💡 This usually means autoplay was blocked by browser');
          });
        
        // Monitor playback events
        audioElement.addEventListener('playing', () => {
          console.log('  🎵 [Event: playing]', participant.identity, 'audio is NOW playing');
        });
        
        audioElement.addEventListener('pause', () => {
          console.warn('  ⏸️ [Event: pause]', participant.identity, 'audio was PAUSED');
        });
        
        audioElement.addEventListener('ended', () => {
          console.warn('  🏁 [Event: ended]', participant.identity, 'audio ENDED');
        });
        
        audioElementsRef.current.set(participant.identity, audioElement);

        console.log('  ✅ [Audio Player] Created and playing:', {
          participant: participant.identity,
          trackSid: track.sid,
          totalAudioElements: audioElementsRef.current.size
        });
        
        // 🔍 DEBUG: CONFIRM AUDIO PLAYBACK
        console.log('\n🔊 [AUDIO PLAYBACK CONFIRMED]');
        console.log('  👂 USER', currentUserIdRef.current, 'is NOW HEARING:', participant.identity);
        console.log('  🎵 Audio element attached to DOM');
        console.log('  🔄 Autoplay:', audioElement.autoplay);
        console.log('  📊 Total people I can hear:', audioElementsRef.current.size);
        console.log('  ⚠️ NOTE: Track will play even if remote user is MUTED');
        console.log('  💡 Mute only affects track.isMuted property, audio still flows\n');

        // �️ WEB AUDIO API: Analyze audio data to confirm it's flowing
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const mediaStreamSource = audioContext.createMediaStreamSource(track.mediaStream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          mediaStreamSource.connect(analyser);
          
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let lastLogTime = 0;
          
          const checkAudioData = () => {
            analyser.getByteTimeDomainData(dataArray);
            
            // Calculate average amplitude
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const normalized = (dataArray[i] - 128) / 128; // -1 to 1
              sum += Math.abs(normalized);
            }
            const avgAmplitude = sum / dataArray.length;
            
            // Log audio activity with speaker icon
            const now = Date.now();
            if (avgAmplitude > 0.01 && now - lastLogTime > 2000) {
              console.log(`📊 [Audio Data] ${participant.identity} - ${(avgAmplitude * 100).toFixed(2)}% amplitude`);
              lastLogTime = now;
            }
            
            requestAnimationFrame(checkAudioData);
          };
          
          checkAudioData();
          console.log('🎙️ [AUDIO ANALYZER] Started for:', participant.identity);
        } catch (analyzerErr) {
          console.warn('⚠️ Could not create audio analyzer:', analyzerErr.message);
        }

        // �🎧 Listen for track mute/unmute events to ensure audio plays after unmute
        track.on('muted', () => {
          console.log('🔇 [TRACK EVENT] Remote track MUTED:', participant.identity);
          console.log('  Track SID:', track.sid);
          console.log('  Note: Audio element will still exist but no audio data will flow\n');
        });

        track.on('unmuted', () => {
          console.log(`🔊 [Track Unmuted] ${participant.identity}`);
          
          // Re-attach track to fix stale MediaStream
          const oldElement = audioElementsRef.current.get(participant.identity);
          if (oldElement) {
            oldElement.remove();
            audioElementsRef.current.delete(participant.identity);
          }
          
          try {
            const newAudioElement = track.attach();
            newAudioElement.autoplay = true;
            newAudioElement.style.display = 'none';
            document.body.appendChild(newAudioElement);
            audioElementsRef.current.set(participant.identity, newAudioElement);
          } catch (err) {
            console.error('❌ Failed to re-attach track:', err);
          }
        });

      } catch (err) {
        console.error('  ❌ [Audio Player] Failed to create audio element:', err);
      }
    };

    /**
     * 🔇 [trackUnsubscribed] Remove audio element when track ends
     */
    const handleTrackUnsubscribed = (track, publication, participant) => {
      if (track.kind !== 'audio') return;

      console.log('\n🔇 [trackUnsubscribed] Audio track removed:', {
        participant: participant.identity,
        trackSid: track.sid
      });
      
      // 🔍 DEBUG: WHO STOPPED SENDING AUDIO?
      console.log('\n🛑 [AUDIO STOPPED]');
      console.log('  👤 I AM: User', currentUserIdRef.current);
      console.log('  📡 STOPPED RECEIVING FROM:', participant.identity);
      console.log('  💡 Reason: Track unsubscribed (user left, disconnected, or track removed)\n');

      // Remove audio element from DOM and ref
      const audioElement = audioElementsRef.current.get(participant.identity);
      if (audioElement) {
        audioElement.remove();
        audioElementsRef.current.delete(participant.identity);
        
        console.log('  ✅ Audio element removed:', {
          participant: participant.identity,
          remainingElements: audioElementsRef.current.size
        });
        console.log('  👂 I can now hear', audioElementsRef.current.size, 'people\n');
      } else {
        console.log('  ℹ️ No audio element to remove (might not have been created)');
      }
    };

    // ✅ [PROCESS EXISTING TRACKS] Automatically subscribed by LiveKit
    console.log('🔍 [EXISTING TRACKS] Processing', livekitRoom.remoteParticipants.size, 'existing participants...');
    
    livekitRoom.remoteParticipants.forEach((participant) => {
      console.log('👤 [LATE JOINER] Checking participant:', participant.identity);
      console.log('📺 [LATE JOINER] Total track publications:', participant.trackPublications.size);
      
      let screenStream = null;
      let cameraStream = null;
      
      // ✅ Check for existing screen share and camera tracks (for late joiners)
      participant.trackPublications.forEach((publication) => {
        console.log('📼 [LATE JOINER] Found track:', {
          source: publication.source,
          kind: publication.kind,
          trackSid: publication.trackSid,
          isSubscribed: publication.isSubscribed,
          trackAvailable: !!publication.track
        });
        if (publication.source === Track.Source.ScreenShare) {
          console.log('🎥 [LATE JOINER] Found existing screen share from:', participant.identity);
          
          // Subscribe to the screen share
          publication.setSubscribed(true);
          
          // If track is already available, store it
          if (publication.track) {
            screenStream = new MediaStream([publication.track.mediaStreamTrack]);
            console.log('✅ [LATE JOINER] Screen share track ready');
          }
        }
        
        if (publication.source === Track.Source.Camera) {
          console.log('📹 [LATE JOINER] Found existing camera from:', participant.identity);
          
          // Subscribe to the camera
          publication.setSubscribed(true);
          
          // If track is already available, store it
          if (publication.track) {
            cameraStream = new MediaStream([publication.track.mediaStreamTrack]);
            console.log('✅ [LATE JOINER] Camera track ready');
          }
        }
      });
      
      // Display both streams on blackboard if found
      if (screenStream || cameraStream) {
        console.log('🎬 [LATE JOINER] Displaying media on blackboard:', {
          hasScreen: !!screenStream,
          hasCamera: !!cameraStream
        });
        
        setBlackboardMedia({
          type: 'liveshare',
          stream: screenStream,
          cameraStream: cameraStream,
          playing: true
        });
      }
      
      // Process existing audio tracks
      participant.audioTrackPublications.forEach((publication) => {
        // autoSubscribe: true means tracks are already subscribed
        if (publication.isSubscribed && publication.track && publication.track.kind === 'audio') {
          console.log(`  👤 Processing ${participant.identity}: ${publication.trackSid}`);
          handleTrackSubscribed(publication.track, publication, participant);
        }
      });
    });

    console.log('✅ [EXISTING TRACKS] Processed. Audio elements:', audioElementsRef.current.size);

    // Register event listeners for new tracks
    livekitRoom.on('trackSubscribed', handleTrackSubscribed);
    livekitRoom.on('trackUnsubscribed', handleTrackUnsubscribed);

    // console.log('✅ [AUDIO SUBSCRIPTION] Event listeners registered');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🎤 SPEAKER IDENTIFICATION - Track who is speaking in real-time
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * Track ALL active speakers in the room (fires when speaker list changes)
     * Updates avatar orbs with real-time audio levels for dynamic pulsing
     */
    const handleActiveSpeakersChanged = (speakers) => {
      // Build new state: { userId: { isSpeaking: true, audioLevel: 0-255 } }
      const newAudioStates = {};
      
      speakers.forEach((speaker) => {
        const speakerUserId = parseInt(speaker.identity.split('-')[1]);
        const audioLevel = speaker.audioLevel || 0;
        const normalizedLevel = Math.round(audioLevel * 255); // Convert 0-1 to 0-255 (same as Cinema)
        newAudioStates[speakerUserId] = {
          isSpeaking: true,
          audioLevel: normalizedLevel, // 0-255 range for visible pulsation
        };
      });
      
      // Set all participants to not speaking, then override with active speakers
      setRemoteAudioStates(prev => {
        const next = {};
        // Reset all to silent
        Object.keys(prev).forEach(userId => {
          next[userId] = { isSpeaking: false, audioLevel: 0 };
        });
        // Add active speakers
        Object.assign(next, newAudioStates);
        return next;
      });
      
      // Log only when there are active speakers (reduce console noise)
      if (speakers.length > 0) {
        console.log(`🎤 [Active Speakers] ${speakers.length} speaking:`,
          speakers.map(s => {
            const userId = parseInt(s.identity.split('-')[1]);
            return `${s.identity} (${(s.audioLevel * 100).toFixed(0)}%)`;
          }).join(', ')
        );
      }
    };

    /**
     * Track individual participant speaking status (fires for each participant)
     * Updates audio level for smooth orb animations
     */
    const handleParticipantSpeakingChanged = (participant) => {
      const userId = parseInt(participant.identity.split('-')[1]);
      
      console.log(`🔊 [Speaking Changed] User ${userId}:`, {
        isSpeaking: participant.isSpeaking,
        audioLevel: participant.audioLevel,
        identity: participant.identity
      });
      
      setRemoteAudioStates(prev => {
        const rawLevel = participant.isSpeaking ? participant.audioLevel : 0;
        const normalizedLevel = Math.round(rawLevel * 255); // Convert 0-1 to 0-255 (same as Cinema)
        const updated = {
          ...prev,
          [userId]: {
            isSpeaking: participant.isSpeaking,
            audioLevel: normalizedLevel, // 0-255 range for visible pulsation
          },
        };
        console.log(`🎯 [Audio State Updated] All states:`, updated);
        return updated;
      });
    };

    // Register speaker identification listeners
    livekitRoom.on('activeSpeakersChanged', handleActiveSpeakersChanged);
    
    // Listen to speaking changes for existing remote participants
    livekitRoom.remoteParticipants.forEach((participant) => {
      participant.on('isSpeakingChanged', () => handleParticipantSpeakingChanged(participant));
    });

    
    
    // Listen for new participants joining (to add speaking listeners)
    const handleParticipantConnected = (participant) => {
      console.log('👤 [NEW PARTICIPANT] Adding speaking listener for:', participant.identity);
      participant.on('isSpeakingChanged', () => handleParticipantSpeakingChanged(participant));
    };
    livekitRoom.on('participantConnected', handleParticipantConnected);

    // console.log('✅ [SPEAKER IDENTIFICATION] Event listeners registered\n');

    // 🔍 PERIODIC AUDIT: Check audio elements every 5 seconds
    const auditInterval = setInterval(() => {
      if (audioElementsRef.current.size > 0) {
        // console.log('\n🔍 [AUDIO AUDIT] Checking', audioElementsRef.current.size, 'audio elements...');
        audioElementsRef.current.forEach((element, identity) => {
          const isInDOM = document.body.contains(element);
          // console.log(`  📊 ${identity}:`, {
          //   inDOM: isInDOM,
          //   paused: element.paused,
          //   muted: element.muted,
          //   volume: element.volume,
          //   currentTime: element.currentTime.toFixed(2),
          //   readyState: element.readyState,
          //   srcObject: !!element.srcObject
          // });
          
          if (!isInDOM) {
            console.error(`  ❌ Element NOT in DOM! Re-appending...`);
            document.body.appendChild(element);
          }
          
          if (element.paused && !element.muted) {
            console.warn(`  ⏸️ Element is paused but not muted! Calling play()...`);
            element.play().catch(e => console.error('  ❌ Play failed:', e.message));
          }
        });
        console.log('');
      }
    }, 5000);

    // Cleanup
    return () => {
      clearInterval(auditInterval);
      livekitRoom.off('trackSubscribed', handleTrackSubscribed);
      livekitRoom.off('trackUnsubscribed', handleTrackUnsubscribed);
      livekitRoom.off('activeSpeakersChanged', handleActiveSpeakersChanged);
      livekitRoom.off('participantConnected', handleParticipantConnected);
      
      // Remove speaking listeners from all participants
      livekitRoom.remoteParticipants.forEach((participant) => {
        participant.off('isSpeakingChanged', handleParticipantSpeakingChanged);
      });
      
      console.log('🧹 [AUDIO SUBSCRIPTION] Event listeners removed');
    };
  }, [livekitRoom, isLivekitConnected, isLectureHall, discussionMode, getRowFromSeatId]);
  // ✅ discussionMode in deps: When toggling to discussion mode, re-run to register trackSubscribed handler
  
  // 🎯 [SELECTIVE SUBSCRIPTION] Lecture Hall Row-Based Audio Filtering
  // Runs for all lecture halls - handles both default and discussion modes
  useEffect(() => {
    if (!livekitRoom || !isLivekitConnected || !isLectureHall) {
      return; // Only for lecture halls
    }

    // console.log('🎯 [SELECTIVE SUBSCRIPTION]', discussionMode ? 'Discussion mode - subscribe to all' : 'Default mode - row-based audio');
    
    const shouldSubscribeToSpeaker = (speakerUserId) => {
      // Discussion mode: everyone hears everyone
      if (discussionMode) return true;
      
      // Host in default mode: doesn't hear anyone (broadcast only)
      if (isHost && !discussionMode) {
        console.log('  🎤 [HOST DEFAULT MODE] Host does not subscribe to students');
        return false;
      }
      
      const myUserId = currentUserIdRef.current;
      const mySeatId = userSeatsRef.current[myUserId];
      const speakerSeatId = userSeatsRef.current[speakerUserId];
      
      if (!mySeatId || !speakerSeatId) return false;
      
      // Always hear host (seat 145)
      if (speakerSeatId === 145 || speakerSeatId === '145') return true;
      
      // Always hear approved speakers
      if (approvedSpeakers[speakerUserId]) return true;
      
      // Default: Same row AND column only
      const myLocation = getRowFromSeatId(mySeatId);
      const speakerLocation = getRowFromSeatId(speakerSeatId);
      
      if (!myLocation || !speakerLocation || myLocation === 'host' || speakerLocation === 'host') {
        return false;
      }
      
      // Must match BOTH row AND column
      return myLocation.row === speakerLocation.row && myLocation.column === speakerLocation.column;
    };
    
    const updateAllSubscriptions = () => {
      livekitRoom.remoteParticipants.forEach((participant) => {
        const speakerUserId = parseInt(participant.identity.split('-')[1]);
        const shouldSubscribe = shouldSubscribeToSpeaker(speakerUserId);
        
        participant.trackPublications.forEach((publication) => {
          if (publication.kind !== 'audio') return;
          
          if (publication.isSubscribed !== shouldSubscribe) {
            publication.setSubscribed(shouldSubscribe);
          }
        });
      });
    };
    
    const handleTrackPublished = (publication, participant) => {
      // Handle screen share tracks for LiveShare
      if (publication.source === Track.Source.ScreenShare) {
        console.log(`🎥 [LiveShare] Screen share track published by ${participant.identity}`);
        
        // If not the host (local participant), subscribe and display
        if (participant !== livekitRoom.localParticipant) {
          console.log('🔔 [LiveShare] Member subscribing to screen share...');
          
          // Subscribe to get the track
          publication.setSubscribed(true);
          
          // If track is already available, use it immediately
          if (publication.track) {
            const screenStream = new MediaStream([publication.track.mediaStreamTrack]);
            
            console.log('✅ [LiveShare] Member displaying screen share (track already available)');
            
            setBlackboardMedia({
              type: 'liveshare',
              stream: screenStream,
              playing: true
            });
          } else {
            console.log('⏳ [LiveShare] Waiting for TrackSubscribed event...');
          }
        }
        return;
      }
      
      // Handle camera tracks for LiveShare
      if (publication.source === Track.Source.Camera) {
        console.log(`📹 [LiveShare] Camera track published by ${participant.identity}`);
        
        // If not the host (local participant), subscribe and display
        if (participant !== livekitRoom.localParticipant) {
          console.log('🔔 [LiveShare] Member subscribing to camera...');
          
          // Subscribe to get the track
          publication.setSubscribed(true);
          
          // If track is already available, use it immediately
          if (publication.track) {
            const cameraStream = new MediaStream([publication.track.mediaStreamTrack]);
            
            console.log('✅ [LiveShare] Member displaying camera (track already available)');
            
            // Get current blackboard media to preserve screen share if it exists
            setBlackboardMedia((prev) => ({
              type: 'liveshare',
              stream: prev?.stream || null,
              cameraStream: cameraStream,
              playing: true
            }));
          } else {
            console.log('⏳ [LiveShare] Waiting for camera TrackSubscribed event...');
          }
        }
        return;
      }
      
      // Handle audio tracks
      if (publication.kind !== 'audio') return;
      
      const speakerUserId = parseInt(participant.identity.split('-')[1]);
      const shouldSubscribe = shouldSubscribeToSpeaker(speakerUserId);
      
      // console.log(`📢 [NEW TRACK] ${participant.identity} → ${shouldSubscribe ? 'Subscribe' : 'Skip'}`);
      
      publication.setSubscribed(shouldSubscribe);
    };
    
    // Subscribe to existing tracks based on rules
    updateAllSubscriptions();
    
    // Listen for new tracks
    livekitRoom.on(RoomEvent.TrackPublished, handleTrackPublished);
    
    // Cleanup
    return () => {
      livekitRoom.off(RoomEvent.TrackPublished, handleTrackPublished);
      console.log('🧹 [SELECTIVE SUBSCRIPTION] Cleaned up');
    };
  }, [livekitRoom, isLivekitConnected, isLectureHall, discussionMode, approvedSpeakers, isHost, getRowFromSeatId]);
  
  // 🧹 [DISCUSSION MODE CLEANUP] Remove inappropriate audio elements when toggling discussion mode OFF
  useEffect(() => {
    // Only cleanup when discussion mode turns OFF in lecture halls
    if (discussionMode || !isLectureHall || audioElementsRef.current.size === 0) {
      return;
    }
    
    console.log('🧹 [DISCUSSION MODE OFF] Cleaning up audio elements...');
    
    // Remove audio elements for participants we should no longer hear
    audioElementsRef.current.forEach((element, identity) => {
      // Parse user ID from identity (format: "user-123")
      const userId = parseInt(identity.split('-')[1]);
      
      // Determine if we should keep this audio element based on subscription logic
      let shouldKeep = false;
      
      if (isHostRef.current) {
        // Host in default mode doesn't hear anyone (broadcast only)
        console.log('  🎤 [HOST CLEANUP] Host removing all audio elements in default mode');
        shouldKeep = false;
      } else {
        const mySeatId = userSeatsRef.current[currentUserIdRef.current];
        const speakerSeatId = userSeatsRef.current[userId];
        
        if (mySeatId && speakerSeatId) {
          // Always keep host audio
          if (speakerSeatId === 145 || speakerSeatId === '145') {
            shouldKeep = true;
          }
          // Always keep approved speakers
          else if (approvedSpeakersRef.current[userId]) {
            shouldKeep = true;
          }
          // Keep same row+column speakers
          else {
            const myLocation = getRowFromSeatId(mySeatId);
            const speakerLocation = getRowFromSeatId(speakerSeatId);
            
            if (myLocation && speakerLocation && myLocation !== 'host' && speakerLocation !== 'host') {
              shouldKeep = myLocation.row === speakerLocation.row && myLocation.column === speakerLocation.column;
            }
          }
        }
      }
      
      if (!shouldKeep) {
        console.log('  🗑️ Removing audio element:', identity);
        element.remove();
        audioElementsRef.current.delete(identity);
      }
    });
    
    console.log('✅ [DISCUSSION MODE OFF] Cleanup complete. Remaining audio elements:', audioElementsRef.current.size);
  }, [discussionMode, isLectureHall, getRowFromSeatId]);
  
  // 🔄 [SUBSCRIPTION SYNC] Re-evaluate subscriptions when discussion mode or approval changes
  useEffect(() => {
    if (!livekitRoom || !isLivekitConnected || !isLectureHall) {
      return;
    }
    
    // console.log(`🔄 [SYNC] Mode: ${discussionMode ? 'Discussion' : 'Default'}, Approved: ${Object.keys(approvedSpeakers).length}`);
    
    livekitRoom.remoteParticipants.forEach((participant) => {
      const speakerUserId = parseInt(participant.identity.split('-')[1]);
      
      // Recalculate subscription based on new state
      let shouldSubscribe;
      
      if (isHost) {
        // Host only hears students in discussion mode
        shouldSubscribe = discussionMode;
      } else if (approvedSpeakers[speakerUserId]) {
        shouldSubscribe = true;
      } else {
        // Check row/column
        const mySeatId = userSeatsRef.current[currentUserIdRef.current];
        const speakerSeatId = userSeatsRef.current[speakerUserId];
        
        if (!mySeatId || !speakerSeatId) {
          shouldSubscribe = false;
        } else if (speakerSeatId === 145 || speakerSeatId === '145') {
          shouldSubscribe = true;
        } else {
          const myLoc = getRowFromSeatId(mySeatId);
          const spLoc = getRowFromSeatId(speakerSeatId);
          
          if (!myLoc || !spLoc || myLoc === 'host' || spLoc === 'host') {
            shouldSubscribe = false;
          } else {
            shouldSubscribe = myLoc.row === spLoc.row && myLoc.column === spLoc.column;
          }
        }
      }
      
      participant.trackPublications.forEach((publication) => {
        if (publication.kind === 'audio' && publication.isSubscribed !== shouldSubscribe) {
          publication.setSubscribed(shouldSubscribe);
        }
      });
    });
    
    // console.log('✅ [SUBSCRIPTION SYNC] Complete\n');
  }, [discussionMode, approvedSpeakers, livekitRoom, isLivekitConnected, isLectureHall, isHost, getRowFromSeatId]);
  
  // 🧹 [CLEANUP] Remove all audio elements on real component unmount
  useEffect(() => {
    return () => {
      // This cleanup runs when component REALLY unmounts (not strict mode double-invoke)
      if (audioElementsRef.current.size > 0) {
        console.log('🧹 [AUDIO CLEANUP] Removing all audio elements:', audioElementsRef.current.size);
        audioElementsRef.current.forEach((element, identity) => {
          element.remove();
          console.log('  Removed:', identity);
        });
        audioElementsRef.current.clear();
      }
    };
  }, []); // Empty deps = runs only on final unmount
  
  // Log remote participants for debugging (reduced verbosity)
  useEffect(() => {
    if (remoteParticipants.length === 0) return; // Don't log when empty
    // console.log('👥 [Remote Participants Debug]', remoteParticipants.length, 'participants');
  }, [remoteParticipants]);
  
  // Initialize user seat assignment on join
  useEffect(() => {
    if (!currentUser || !sendMessage || !isConnected) return;
    
    // Add current user to username mapping
    setUserIdToUsername(prev => ({
      ...prev,
      [currentUser.id]: currentUser.username
    }));
    
    // console.log('🎓 [PositionCalculator] Initializing seat assignment for user:', currentUser.id);
    
    // Request seat assignment
    const assignSeat = () => {
      console.log('🎯 [assignSeat] CALLED - Requesting seat from backend', {
        currentUserId: currentUser?.id,
        isHost,
        timestamp: new Date().toISOString()
      });
      
      // Check if user already has a seat assigned
      if (userSeats[currentUser?.id]) {
        console.log('⚠️ [assignSeat] User already has seat assigned:', userSeats[currentUser.id], '- ABORTING assignment');
        return;
      }
      
      // ✅ NEW: Request seat from backend instead of calculating locally
      // Backend will find first available seat atomically (race-condition proof)
      console.log('📤 [SEAT REQUEST] Sending request_seat to backend:', {
        type: 'request_seat',
        user_id: currentUser.id
      });
      
      sendMessage({
        type: 'request_seat',
        user_id: currentUser.id
      });
      
      // Backend will respond with seat_assigned message
      // which is already handled in the WebSocket message handler
    };
    
    // Delay seat assignment to allow WebSocket to fully connect
    console.log('🎓 [Init useEffect] TRIGGERED - Scheduling seat assignment. Dependencies:', { 
      currentUserId: currentUser?.id, 
      isConnected, 
      isHost,
      hasSendMessage: !!sendMessage,
      currentUserSeats: userSeats,
      timestamp: new Date().toISOString()
    });
    const timer = setTimeout(assignSeat, 1000);
    return () => {
      console.log('🧹 [Init useEffect] CLEANUP - Canceling seat assignment timer', {
        currentUserId: currentUser?.id,
        timestamp: new Date().toISOString()
      });
      clearTimeout(timer);
    };
  }, [currentUser, sendMessage, isConnected]); // ✅ Removed isHost from dependencies
  
  // ✅ FIX: Reassign seat when isHost changes from false to true (after room API loads)
  useEffect(() => {
    console.log('🔄 [Host Reassignment useEffect] TRIGGERED', {
      currentUserId: currentUser?.id,
      isHost,
      isConnected,
      hasSendMessage: !!sendMessage,
      currentSeatId: userSeats[currentUser?.id],
      allUserSeats: userSeats,
      timestamp: new Date().toISOString()
    });
    
    if (!currentUser || !sendMessage || !isConnected || !isHost) {
      console.log('⏭️ [Host Reassignment] Skipping - conditions not met');
      return;
    }
    
    // Check if user already has a seat assigned
    const currentSeatId = userSeats[currentUser.id];
    
    // If host has a non-145 seat, reassign to seat 145
    // Convert to number for comparison since backend may send string or number
    if (currentSeatId && Number(currentSeatId) !== 145) {
      console.log('🔄 [Host Reassignment] Host detected with wrong seat:', currentSeatId, '→ Reassigning to seat 145');
      
      const hostSeat = getLectureHallHostSeat();
      if (hostSeat) {
        setCurrentSeat(hostSeat);
        
        // Update userSeats mapping
        setUserSeats(prev => ({
          ...prev,
          [currentUser.id]: 145
        }));
        
        // Send updated seat assignment to backend
        console.log('📤 [HOST REASSIGNMENT] Sending to backend:', {
          type: 'take_seat',
          seat_id: 145,
          user_id: currentUser.id,
          oldSeat: currentSeatId
        });
        sendMessage({
          type: 'take_seat',
          seat_id: 145,
          row: hostSeat.row,
          col: hostSeat.column,
          user_id: currentUser.id
        });
        
        toast.success('Host seat updated to 145');
        console.log('✅ [Host Reassignment] Successfully moved host to seat 145');
      }
    }
  }, [isHost, currentUser, sendMessage, isConnected, userSeats]);
  
  // ✅ Handler for board video time updates (for fullscreen sync)
  const handleBoardVideoTimeUpdate = useCallback((currentTime) => {
    boardVideoTimeRef.current = currentTime;
  }, []);
  
  // ⏰ Periodic seek time update for preview generation (every 30 seconds)
  useEffect(() => {
    console.log('🔍 [Lecture Hall Periodic] Effect triggered:', {
      isHost,
      hasBlackboardMedia: !!blackboardMedia,
      mediaType: blackboardMedia?.type,
      mediaPlaying: blackboardMedia?.playing,
      hasFileUrl: !!(blackboardMedia?.file_url || blackboardMedia?.url),
      willStartInterval: isHost && blackboardMedia && (blackboardMedia.file_url || blackboardMedia.url) && blackboardMedia.playing
    });
    
    // Check for uploaded media by presence of file_url/url (type contains MIME type like 'video/mp4', not source type)
    if (!isHost || !blackboardMedia || !(blackboardMedia.file_url || blackboardMedia.url) || !blackboardMedia.playing) {
      return;
    }

    console.log('✅ [Lecture Hall Periodic] Starting 30-second interval');
    const updateInterval = setInterval(() => {
      const currentSeekTime = Math.floor(boardVideoTimeRef.current || 0);
      console.log(`⏰ [Lecture Hall] Periodic seek time update: ${currentSeekTime}s`);
      
      // Send playback_control with current seek time to update database
      sendMessage({
        type: "playback_control",
        command: "seek",
        media_item_id: blackboardMedia.id,
        file_path: blackboardMedia.file_path,
        file_url: blackboardMedia.url || blackboardMedia.file_url,
        original_name: blackboardMedia.original_name || blackboardMedia.title || 'Unknown',
        seek_time: currentSeekTime,
        timestamp: Date.now(),
        sender_id: currentUser?.id,
      });
    }, 30000); // Update every 30 seconds

    return () => {
      console.log('🛑 [Lecture Hall Periodic] Stopping interval');
      clearInterval(updateInterval);
    };
  }, [isHost, blackboardMedia, sendMessage, currentUser?.id]);
  
  // ✅ Handler for capturing preview frames from LiveShare/WatchFrom
  const handleCapturePreviewFrames = useCallback(async () => {
    console.log('📸 [Frame Capture] Starting frame capture for preview');
    
    if (!actualSessionId) {
      console.error('❌ [Frame Capture] No session ID available');
      return;
    }
    
    // Find the video element to capture from
    let videoElement = null;
    
    // Check blackboard media (for both uploads and LiveShare/WatchFrom)
    if (blackboardMedia) {
      if (boardVideoRef.current) {
        videoElement = boardVideoRef.current;
        console.log('🎥 [Frame Capture] Using blackboard video element');
      } else if (cameraVideoRef.current) {
        videoElement = cameraVideoRef.current;
        console.log('📹 [Frame Capture] Using camera video element (LiveShare camera mode)');
      } else {
        console.warn('⚠️ [Frame Capture] Blackboard media exists but no video ref');
      }
    }
    
    if (!videoElement) {
      console.error('❌ [Frame Capture] No video element found to capture from');
      return;
    }
    
    try {
      // Create canvas for frame capture
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size (320px width maintains aspect ratio for GIF)
      const aspectRatio = videoElement.videoHeight / videoElement.videoWidth;
      canvas.width = 320;
      canvas.height = Math.floor(320 * aspectRatio);
      
      console.log('🖼️ [Frame Capture] Canvas size:', canvas.width, 'x', canvas.height);
      
      // Capture 6 frames over 30 seconds (1 frame every 5 seconds)
      const frames = [];
      const frameCaptureInterval = 5000; // 5 seconds
      const totalFrames = 6;
      
      for (let i = 0; i < totalFrames; i++) {
        // Draw current frame to canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to blob
        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', 0.85);
        });
        
        frames.push(blob);
        console.log(`📷 [Frame Capture] Captured frame ${i + 1}/${totalFrames}`);
        
        // Wait before capturing next frame (except on last frame)
        if (i < totalFrames - 1) {
          await new Promise(resolve => setTimeout(resolve, frameCaptureInterval));
        }
      }
      
      console.log(`✅ [Frame Capture] Captured ${frames.length} frames, uploading...`);
      
      // Upload frames to backend
      const formData = new FormData();
      frames.forEach((blob, index) => {
        formData.append('frames', blob, `frame_${index}.jpg`);
      });
      
      console.log(`📤 [Frame Capture] Preparing upload to /api/sessions/${actualSessionId}/upload-frames`);
      console.log(`   ├─ Frames: ${frames.length}`);
      console.log(`   ├─ Total size: ${(frames.reduce((sum, b) => sum + b.size, 0) / 1024).toFixed(2)} KB`);
      console.log(`   └─ Auth: Using cookies (withCredentials: true)`);
      
      // ✅ FIX: Use fetch with credentials (cookies), not Authorization header
      // This app uses HTTP-only cookies for auth, not Bearer tokens
      const response = await fetch(`http://localhost:8080/api/sessions/${actualSessionId}/upload-frames`, {
        method: 'POST',
        credentials: 'include', // ✅ Send cookies with request
        body: formData,
        // Don't set Content-Type - browser will set it with boundary for multipart/form-data
      });
      
      console.log(`📡 [Frame Capture] Upload response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [Frame Capture] Upload failed:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Frame upload failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ [Frame Capture] ========================================');
      console.log('✅ [Frame Capture] FRAMES UPLOADED SUCCESSFULLY');
      console.log(`   ├─ Poster: ${result.poster_url || 'N/A'}`);
      console.log(`   ├─ Preview GIF: ${result.preview_url || 'N/A'}`);
      console.log(`   └─ Message: ${result.message || 'Success'}`);
      console.log('✅ [Frame Capture] ========================================');
      
    } catch (error) {
      console.error('❌ [Frame Capture] ========================================');
      console.error('❌ [Frame Capture] ERROR CAPTURING/UPLOADING FRAMES');
      console.error(`   └─ Error:`, error);
      console.error('❌ [Frame Capture] ========================================');
    }
  }, [actualSessionId, blackboardMedia, boardVideoRef]);
  
  // ESC key - Exit fullscreen
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key === 'Escape' && isMediaFullscreen) {
        event.preventDefault();
        setIsMediaFullscreen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isMediaFullscreen]);
  
  // Sync currentSeatIndex when user's seat changes in userSeats
  useEffect(() => {
    if (!currentUser?.id || !previewSeats.length) return;
    
    const userCurrentSeatId = userSeats[currentUser.id];
    if (!userCurrentSeatId) return;
    
    const userSeatIndex = previewSeats.findIndex(s => s.id === userCurrentSeatId);
    if (userSeatIndex >= 0 && userSeatIndex !== currentSeatIndex) {
      console.log('🔄 [Sync SeatIndex] Syncing currentSeatIndex to user seat:', userCurrentSeatId, 'at index:', userSeatIndex);
      setCurrentSeatIndex(userSeatIndex);
      setSelectedSeatId(userCurrentSeatId);
    }
  }, [userSeats, currentUser?.id, previewSeats]);
  
  // Move camera to assigned seat
  useEffect(() => {
    if (!currentSeat || !controlsRef.current) return;
    
    console.log('📍 [useEffect:currentSeat] currentSeat changed to seat:', currentSeat.id);
    
    // Auto-populate selectedSeatId for view direction modal
    setSelectedSeatId(currentSeat.id);
    
    // Wait a brief moment for controls to be ready
    const timer = setTimeout(() => {
      if (controlsRef.current) {
        console.log('📹 [useEffect:currentSeat] calling snapCameraToSeat for seat:', currentSeat.id);
        snapCameraToSeat(currentSeat);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [currentSeat]);
  
  // 🔥 DEDICATED HANDLER: Process private chat messages independently
  const processedPrivateMsgIdsRef = useRef(new Set());
  
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Filter for private_chat_message types
    const privateMessages = messages.filter(msg => msg.type === 'private_chat_message');
    
    privateMessages.forEach(message => {
      const data = message.data || {};
      const msgId = data.id;
      
      // Skip if already processed
      if (msgId && processedPrivateMsgIdsRef.current.has(msgId)) {
        return;
      }
      
      // Determine which user to store the message under
      const otherUserId = data.sender_id === currentUser?.id ? data.receiver_id : data.sender_id;
      
      // ✅ Only add to state if current user is the RECEIVER (not sender)
      // Sender already has optimistic update, this prevents duplicates
      if (data.receiver_id === currentUser?.id) {
        // Update state
        setPrivateMessages(prev => ({
          ...prev,
          [otherUserId]: [...(prev[otherUserId] || []), {
            message: data.message,
            from_user_id: data.sender_id,
            to_user_id: data.receiver_id,
            timestamp: data.created_at || new Date().toISOString()
          }]
        }));
        
        // ✅ Increment unread count if chat is not currently open with this user
        if (privateChatUserId !== otherUserId) {
          setUnreadMessages(prev => ({
            ...prev,
            [otherUserId]: (prev[otherUserId] || 0) + 1
          }));
        }
      }
      
      // Mark as processed
      if (msgId) {
        processedPrivateMsgIdsRef.current.add(msgId);
      }
    });
  }, [messages, currentUser?.id, privateChatUserId]);
  
  // Handle incoming WebSocket messages - Process ALL unprocessed messages
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Process all messages that haven't been processed yet
    const startIndex = lastProcessedIndexRef.current + 1;
    if (startIndex >= messages.length) return; // All messages already processed
    
    logger.debug(`🔄 [Message Processing] Processing ${messages.length - startIndex} messages (${startIndex} to ${messages.length - 1})`);
    
    // Process each unprocessed message
    for (let i = startIndex; i < messages.length; i++) {
      const message = messages[i];
      const { type, data} = message;
      
      logger.debug(`📨 [WS Message ${i}] Processing type: ${type}`);
    
    switch (type) {
      // ✅ EVENT-DRIVEN: Handle session_member_joined (new member tracking)
      case 'session_member_joined':
        if (data?.user_id && data?.username) {
          logger.debug('✅ [session_member_joined] New member joined:', data.user_id, data.username);
          
          // Add to username mapping
          setUserIdToUsername(prev => ({
            ...prev,
            [data.user_id]: data.username
          }));
          
          // Add to watchSessionMembers (check for duplicates)
          setWatchSessionMembers(prev => {
            const exists = prev.find(m => m.id === data.user_id || m.user_id === data.user_id);
            if (exists) {
              logger.debug('⚠️ [session_member_joined] User already in watchSessionMembers:', data.user_id);
              return prev;
            }
            logger.debug('➕ [session_member_joined] Adding to watchSessionMembers:', data.user_id);
            return [...prev, {
              id: data.user_id,
              user_id: data.user_id,
              username: data.username,
              user_role: data.user_role || 'viewer'
            }];
          });
          
          // Show toast notification (except for current user)
          if (data.user_id !== currentUser?.id) {
            toast.success(`${data.username} joined the session`);
          }
          
          // 🎯 HOST: Send current video state to late joiner (like 3D Cinema)
          console.log('🔍 [Late Joiner Sync Check] Member joined:', {
            joiner: data.username,
            isHost,
            hasBlackboardMedia: !!blackboardMedia,
            blackboardMediaFileUrl: blackboardMedia?.file_url,
            blackboardMediaUrl: blackboardMedia?.url,
            blackboardMediaType: blackboardMedia?.type,
            hasSharedVideoRef: !!sharedVideoRef.current,
            videoCurrentTime: sharedVideoRef.current?.currentTime,
            willSendSync: isHost && blackboardMedia && (blackboardMedia.file_url || blackboardMedia.url)
          });
          
          if (isHost && blackboardMedia && (blackboardMedia.file_url || blackboardMedia.url)) {
            const currentVideoTime = sharedVideoRef.current?.currentTime || blackboardMedia.timestamp || 0;
            const syncMessage = {
              type: 'playback_control',
              command: blackboardMedia.playing ? 'play' : 'pause',
              seek_time: currentVideoTime,
              file_path: blackboardMedia.file_url || blackboardMedia.url,
              file_url: blackboardMedia.file_url || blackboardMedia.url,
              media_item_id: blackboardMedia.id || blackboardMedia.media_id,
              original_name: blackboardMedia.title || 'Unknown Media',
              timestamp: Date.now(),
              sender_id: currentUser?.id
            };
            console.log('🎯 [Lecture Hall Sync] Sending video state to late joiner:', {
              joiner: data.username,
              currentTime: currentVideoTime,
              isPlaying: blackboardMedia.playing,
              media: blackboardMedia.title || blackboardMedia.file_url,
              fullMessage: syncMessage
            });
            sendMessage(syncMessage);
          } else {
            console.log('⏭️ [Late Joiner Sync] Skipped - conditions not met');
          }
        }
        break;
      
      // ✅ EVENT-DRIVEN: Handle session_member_left (member leaving)
      case 'session_member_left':
        const leavingUserId = data?.user_id;
        const leavingUsername = data?.username;
        
        if (!leavingUserId) {
          console.error('❌ [session_member_left] No user_id in message');
          break;
        }
        
        // Remove from watchSessionMembers
        setWatchSessionMembers(prev => {
          const filtered = prev.filter(m => (m.id || m.user_id) !== leavingUserId);
          console.log('👋 [MEMBER LEFT] User', leavingUserId, leavingUsername, '| Members:', prev.length, '→', filtered.length);
          return filtered;
        });
        
        // Remove from userSeats (triggers avatar removal)
        setUserSeats(prev => {
          const updated = { ...prev };
          const hadSeat = prev[leavingUserId];
          delete updated[leavingUserId];
          console.log('👋 [MEMBER LEFT] Removed from seat', hadSeat, '| Remaining occupied:', Object.keys(updated).length, '| Full map:', updated);
          return updated;
        });
        
        // Remove from username mapping
        setUserIdToUsername(prev => {
          const updated = { ...prev };
          delete updated[leavingUserId];
          return updated;
        });
        
        // Show toast notification (except for current user)
        if (leavingUserId !== currentUser?.id && leavingUsername) {
          toast(`${leavingUsername} left the session`);
        }
        break;
      
      // ✅ EVENT-DRIVEN: Handle session_status (full member list sync + seating + discussion mode)
      case 'session_status':
        console.log('🧾 [PositionCalculator] Received session_status:', data);
        
        // Sync member list
        if (data?.members && Array.isArray(data.members)) {
          console.log('📊 [session_status] Syncing member list:', data.members.length, 'members');
          
          // Update watchSessionMembers with full list from backend
          setWatchSessionMembers(data.members.map(m => ({
            id: m.user_id || m.id,
            user_id: m.user_id || m.id,
            username: m.username,
            user_role: m.user_role,
            is_active: m.is_active,
            avatar_url: m.avatar_url || null
          })));
          
          // Update username mapping
          data.members.forEach(m => {
            if (m.user_id && m.username) {
              setUserIdToUsername(prev => ({
                ...prev,
                [m.user_id]: m.username
              }));
            }
          });
          
          console.log('✅ [session_status] Member list synced:', data.members.length, 'members');
        }
        
        // Sync discussion mode if present
        if (typeof data?.discussion_mode === 'boolean') {
          console.log('🎤 [PositionCalculator] Discussion mode from session_status:', data.discussion_mode);
          setDiscussionMode(data.discussion_mode);
        }
        
        // ✅ STRATEGY 2: Handle LiveShare track SIDs from session_status (for late joiners)
        if ((data?.screen_track_sid || data?.camera_track_sid) && livekitRoom && !isHost) {
          console.log('⚡ [LiveShare] Track SIDs in session_status:', {
            screen: data.screen_track_sid,
            camera: data.camera_track_sid
          });
          
          // Find host participant (host_id from session_status)
          const hostId = data.host_id;
          if (hostId) {
            const hostParticipant = Array.from(livekitRoom.remoteParticipants.values()).find(
              p => p.identity === `user-${hostId}-${p.identity.split('-')[2]}`
            );
            
            if (hostParticipant) {
              console.log('⚡ [LiveShare] Found host, subscribing via track SIDs');
              
              let screenStream = null;
              let cameraStream = null;
              
              // Direct subscription via track SID (instant!)
              if (data.screen_track_sid) {
                const screenPub = hostParticipant.getTrackPublicationBySid(data.screen_track_sid);
                if (screenPub?.track) {
                  screenStream = new MediaStream([screenPub.track.mediaStreamTrack]);
                  console.log('⚡ [LiveShare] Screen track subscribed via SID');
                } else if (screenPub) {
                  screenPub.setSubscribed(true);
                  console.log('⏳ [LiveShare] Screen track subscribing...');
                }
              }
              
              if (data.camera_track_sid) {
                const cameraPub = hostParticipant.getTrackPublicationBySid(data.camera_track_sid);
                if (cameraPub?.track) {
                  cameraStream = new MediaStream([cameraPub.track.mediaStreamTrack]);
                  console.log('⚡ [LiveShare] Camera track subscribed via SID');
                } else if (cameraPub) {
                  cameraPub.setSubscribed(true);
                  console.log('⏳ [LiveShare] Camera track subscribing...');
                }
              }
              
              // Display on blackboard if tracks available
              if (screenStream || cameraStream) {
                setBlackboardMedia({
                  type: 'liveshare',
                  stream: screenStream,
                  cameraStream: cameraStream,
                  playing: true
                });
              }
            } else {
              console.warn('⚠️ [LiveShare] Host participant not found for track SID subscription');
            }
          }
        }
        
        // ✅ Load existing seat assignments from session_status
        if (data?.seating && typeof data.seating === 'object') {
          // ✅ Backend sends {userId: seatId} format - convert values to strings for consistency
          const seatMap = {};
          Object.entries(data.seating).forEach(([userId, seatId]) => {
            seatMap[userId] = String(seatId);
          });
          console.log('📊 [SESSION_STATUS] Seating from backend:', data.seating, '| Converted to userSeats:', seatMap, '| Total occupied:', Object.keys(seatMap).length);
          setUserSeats(seatMap);
        } else if (data?.seating === undefined || data?.seating === null || Object.keys(data?.seating || {}).length === 0) {
          console.log('📊 [SESSION_STATUS] No seating data - preserving current state');
        }
        
        // Check for active quiz in session status (for late joiners)
        if (data?.active_quiz && !isHost) {
          console.log('📝 [PositionCalculator] Active quiz found in session status:', data.active_quiz);
          setActiveQuiz(data.active_quiz);
        }
        break;
        
      case 'participant_join':
        // Track username from participant_join message
        if (data?.userId && data?.username) {
          console.log('✅ [participant_join] New user joined ROOM (not session):', data.userId, data.username);
          setUserIdToUsername(prev => ({
            ...prev,
            [data.userId]: data.username
          }));
          
          // 🔴 BUG FIX: DO NOT add to watchSessionMembers here!
          // participant_join is sent when connecting to room WebSocket (even without joining session)
          // Only session_member_joined should add to watchSessionMembers
          console.log('ℹ️ [participant_join] NOT adding to watchSessionMembers - wait for session_member_joined');
        }
        break;
        
      case 'member_list':
        // console.log('👥 [PositionCalculator] Member list updated:', data);
        setWatchSessionMembers(data || []);
        break;
        
      case 'user_joined':
        // console.log('👋 [PositionCalculator] User joined:', data);
        // Track username from user_joined
        if (data?.id && data?.username) {
          setUserIdToUsername(prev => ({
            ...prev,
            [data.id]: data.username
          }));
        }
        setWatchSessionMembers(prev => {
          const exists = prev.find(m => m.id === data.id);
          if (exists) return prev;
          return [...prev, data];
        });
        toast.success(`${data.username} joined the lecture hall`);
        break;
        
      case 'user_left':
        const leftUserId = data?.user_id;
        if (!leftUserId) {
          console.error('❌ [user_left] No user_id in message');
          break;
        }
        
        // Remove from watchSessionMembers
        setWatchSessionMembers(prev => prev.filter(m => m.id !== leftUserId));
        
        // Remove from userSeats (triggers avatar removal)
        setUserSeats(prev => {
          const updated = { ...prev };
          const hadSeat = prev[leftUserId];
          delete updated[leftUserId];
          console.log('👋 [USER_LEFT] User', leftUserId, 'removed from seat', hadSeat, '| Remaining:', Object.keys(updated).length);
          return updated;
        });
        
        // Remove from username mapping
        setUserIdToUsername(prev => {
          const updated = { ...prev };
          delete updated[leftUserId];
          return updated;
        });
        break;
        
      case 'take_seat':
      case 'seat_assigned':
      case 'seat_changed':
        // ✅ Take seat data can be at root level or in data object
        const seatUserId = data?.user_id || lastMessage.user_id;
        let seatId = data?.seat_id || lastMessage.seat_id;
        if (!seatUserId || !seatId) {
          console.warn('⚠️ [take_seat] Missing user_id or seat_id:', { data, lastMessage });
          break;
        }
        
        // ✅ Ensure seatId is a number (backend might send as string "1" or number 1)
        seatId = typeof seatId === 'string' ? parseInt(seatId, 10) : seatId;
        console.log('🪑 [seat_assigned] Received seat assignment:', {
          seatUserId,
          seatId,
          seatIdType: typeof seatId,
          isCurrentUser: seatUserId === currentUser?.id,
          currentUserId: currentUser?.id
        });
        
        setUserSeats(prev => {
          const updated = {
            ...prev,
            [seatUserId]: seatId
          };
          logger.debug('🪑 [SEAT ASSIGNMENT] User', seatUserId, '→ Seat', seatId, '| Total occupied:', Object.keys(updated).length, '| Full map:', updated);
          return updated;
        });
        playSeatSound();
        
        // ✅ If this is OUR seat assignment, set currentSeat and show view direction modal
        if (seatUserId === currentUser?.id) {
          console.log('🪑 [seat_assigned] This is MY seat! Fetching seat data for ID:', seatId);
          const assignedSeat = getLectureHallSeatById(seatId);
          console.log('🪑 [seat_assigned] getLectureHallSeatById returned:', assignedSeat);
          
          if (assignedSeat) {
            console.log('🪑 [seat_assigned] Setting currentSeat to:', assignedSeat.id);
            setCurrentSeat(assignedSeat);
            setSelectedSeatId(assignedSeat.id);
            // ✅ DISABLED: View direction modal on join
            // setShowViewDirectionModal(true);
            
            // Show spinner for 0.8s after seat assignment (only if enabled and first time)
            if (enableLoadingOverlay && !hasSeatAssigned) {
              setLoadingStatus('seat_assigned');
              setTimeout(() => {
                setLoadingStatus(null);
              }, 800);
            }
            
            // Mark as seated to prevent spinner on reconnects
            setHasSeatAssigned(true);
            
            const seatType = assignedSeat.isHost ? 'Host position' : `Seat ${assignedSeat.id}`;
            toast.success(`${seatType} assigned! Choose your view direction.`);
          } else {
            console.error('❌ [seat_assigned] Failed to get seat data for ID:', seatId);
          }
        }
        break;
      
      // 🔄 Handle seat_state_refresh (response to request_seat_state)
      case 'seat_state_refresh':
        logger.debug('� [WS seat_state_refresh] ✅ MESSAGE RECEIVED - Processing seat state response');
        logger.debug('🔄 [WS seat_state_refresh] RAW MESSAGE DATA:', JSON.stringify(data, null, 2));
        const seating = data?.seating || {};
        const seatedUsernames = data?.seated_usernames || {};
        logger.debug('🔄 [WS seat_state_refresh] Parsed data - seating entries:', Object.keys(seating).length, 'usernames:', Object.keys(seatedUsernames).length);
        logger.debug('🔄 [WS seat_state_refresh] Seating details:', seating, 'usernames:', seatedUsernames);
        
        // Convert {seatId: userId} to {userId: seatId}
        const newUserSeats = {};
        Object.entries(seating).forEach(([seatId, userId]) => {
          newUserSeats[userId] = Number(seatId);
        });
        
        console.log('🔄 [WS seat_state_refresh] Setting userSeats:', newUserSeats);
        console.log('🔍 [DEBUG] Keys in newUserSeats:', Object.keys(newUserSeats));
        console.log('🔍 [DEBUG] Full structure:', JSON.stringify(newUserSeats, null, 2));
        console.log('🔍 [DEBUG] Current user ID:', currentUser?.id);
        setUserSeats(newUserSeats);
        
        // Also update usernames
        if (Object.keys(seatedUsernames).length > 0) {
          setUserIdToUsername(prev => ({ ...prev, ...seatedUsernames }));
        }
        break;
        
      case 'seat_swap_request':
        handleSeatSwapMessage(lastMessage);
        break;
        
      case 'seat_swap_accepted':
      case 'seat_swap_declined':
        handleSeatSwapMessage(lastMessage);
        break;
      
      case 'lecture_hall_assigned':
        // User was assigned to a lecture hall
        console.log('🏫 [Lecture Hall] Assigned to hall:', data);
        if (data?.hall_number) {
          setCurrentLectureHall(data.hall_number);
          setViewingHallNumber(data.hall_number);
        }
        if (data?.total_halls) {
          setTotalLectureHalls(data.total_halls);
        }
        break;
      
      case 'seat_assignment_error':
        // Backend couldn't assign a seat (lecture hall full)
        console.error('❌ [Seat Assignment] Error:', data);
        toast.error(data?.error || 'Failed to assign seat');
        break;
      
      case 'lecture_hall_created':
        // New hall created (host notification)
        console.log('🏫 [Lecture Hall] New hall created:', data);
        if (data?.hall_number && data?.total_halls) {
          setTotalLectureHalls(data.total_halls);
          if (isHost) {
            toast.info(`Lecture Hall ${data.hall_number} created - room full!`);
          }
        }
        break;
        
      case 'raise_hand':
        if (!data?.user_id) break;
        console.log('✋ [PositionCalculator] User raised hand:', data);
        setRaisedHands(prev => {
          const exists = prev.find(h => h.userId === data.user_id);
          if (exists) return prev;
          return [...prev, {
            userId: data.user_id,
            username: data.username,
            seatId: data.seat_id || null
          }];
        });
        if (isHost) {
          toast(`${data.username} raised their hand!`);
        }
        break;
        
      case 'lower_hand':
        if (!data?.user_id) break;
        console.log('👎 [PositionCalculator] User lowered hand:', data);
        setRaisedHands(prev => prev.filter(h => h.userId !== data.user_id));
        break;
        
      case 'approve_speaker':
        if (!data?.user_id) break;
        console.log('✅ [PositionCalculator] Speaker approved:', data);
        if (data.user_id === currentUser?.id) {
          setHasHostApproval(true);
          toast.success('You can now speak to the class!');
        }
        setApprovedSpeakers(prev => ({ ...prev, [data.user_id]: true }));
        // Remove from raised hands
        setRaisedHands(prev => prev.filter(h => h.userId !== data.user_id));
        break;
        
      case 'hand_raised_response':
        // Backend response when host approves/revokes speaker
        if (typeof data?.approved === 'boolean') {
          console.log('📨 [PositionCalculator] Hand raised response:', data);
          if (data.approved) {
            setHasHostApproval(true);
            setHandRaised(false);
            toast.success('Host approved! You can now speak to everyone!');
          } else {
            setHasHostApproval(false);
            setHandRaised(false);
            toast.warning('Speaking permission revoked');
          }
        }
        break;
        
      case 'speaker_approved':
        // Backend broadcasts when host approves a speaker
        if (data?.user_id) {
          console.log('📢 [PositionCalculator] Speaker approved broadcast:', data);
          setApprovedSpeakers(prev => ({ ...prev, [data.user_id]: true }));
          setRaisedHands(prev => prev.filter(h => h.userId !== data.user_id));
        }
        break;
        
      case 'speaker_revoked':
        // Backend broadcasts when host revokes a speaker
        if (data?.user_id) {
          console.log('📢 [PositionCalculator] Speaker revoked broadcast:', data);
          setApprovedSpeakers(prev => {
            const updated = { ...prev };
            delete updated[data.user_id];
            return updated;
          });
        }
        break;
        
      case 'discussion_mode_changed':
        // Backend broadcasts when host toggles discussion mode
        if (typeof data?.discussion_mode === 'boolean') {
          console.log('🎤 [PositionCalculator] Discussion mode changed:', data.discussion_mode);
          // Sync local state with backend
          setDiscussionMode(data.discussion_mode);
          if (data.discussion_mode) {
            toast('Discussion mode enabled - everyone can speak to all!');
          } else {
            toast('Discussion mode disabled - row-based audio restored');
          }
        }
        break;
      
      case 'revoke_speaker':
        if (!data?.user_id) break;
        console.log('❌ [PositionCalculator] Speaker revoked:', data);
        if (data.user_id === currentUser?.id) {
          setHasHostApproval(false);
          toast.warning('Speaking permission revoked');
        }
        setApprovedSpeakers(prev => {
          const updated = { ...prev };
          delete updated[data.user_id];
          return updated;
        });
        break;
        
      case 'chat_message':
        if (!data) break;
        console.log('💬 [PositionCalculator] Chat message:', data);
        // Session message - deduplicate by ID like VideoWatch.jsx
        const chatMsg = { ...data, reactions: data.reactions || [] };
        setSessionChatMessages(prev => {
          const exists = prev.some(msg => msg.ID === chatMsg.ID);
          if (exists) {
            console.log('⚠️ [PositionCalculator] Duplicate message ignored:', chatMsg.ID);
            return prev;
          }
          return [...prev, chatMsg];
        });
        break;
      
      case 'private_chat_message':
        // ✅ Handled by filtered effect above (lines 3655-3713) which correctly checks receiver
        // This prevents duplicate processing - the effect already filters for receiver_id === currentUser.id
        break;
      
      case 'old_chat_message_handler':
        if (!data) break;
        if (data.is_private && data.recipient_id === currentUser?.id) {
          // Old private message format (deprecated)
          setPrivateMessages(prev => ({
            ...prev,
            [data.sender_id]: [...(prev[data.sender_id] || []), data]
          }));
        } else if (!data.is_private) {
          // Session message - deduplicate by ID like VideoWatch.jsx
          const chatMsg = { ...data, reactions: data.reactions || [] };
          setSessionChatMessages(prev => {
            const exists = prev.some(msg => msg.ID === chatMsg.ID);
            if (exists) {
              console.log('⚠️ [PositionCalculator] Duplicate message ignored:', chatMsg.ID);
              return prev;
            }
            return [...prev, chatMsg];
          });
        }
        break;
        
      case 'user_speaking':
        // WebSocket messages now primarily for selective subscription recipient logic
        // Visual feedback (avatars) handled by LiveKit's activeSpeakersChanged event
        if (data?.user_id !== undefined && typeof data?.speaking === 'boolean') {
          // Play sound for local user's own mic toggle
          if (data.user_id === currentUser?.id) {
            if (data.speaking) {
              playMicOnSound();
            } else {
              playMicOffSound();
            }
          }
          
          // Log broadcast scope for debugging
          const scope = data.broadcast_scope || 'unknown';
          const recipients = data.recipients?.length || 0;
          console.log(`🔊 User ${data.user_id} ${data.speaking ? 'UNMUTED' : 'MUTED'} | Scope: ${scope} | Recipients: ${recipients}`);
        }
        break;
        
      case 'toggle_discussion_mode':
        console.log('💬 [toggle_discussion_mode] Received:', data);
        if (typeof data?.discussion_mode === 'boolean') {
          setDiscussionMode(data.discussion_mode);
          toast(data.discussion_mode ? '💬 Discussion mode enabled - Everyone can speak!' : '🤫 Discussion mode disabled', {
            duration: 3000,
          });
        }
        break;
        
      case 'quiz_created':
        console.log('📝 [PositionCalculator] Quiz created:', data);
        console.log('📝 [PositionCalculator] Quiz ID received:', data.id, 'Type:', typeof data.id);
        toast.success(`Quiz "${data.name}" created successfully!`);
        // Add to quizzes list
        setQuizzes(prev => [...prev, data]);
        break;
        
      case 'quiz_published':
        console.log('📝 [PositionCalculator] Quiz published:', data);
        setActiveQuiz(data);
        
        // ✅ Request fresh quiz history when new quiz is published (for members)
        if (!isHost && actualSessionId) {
          console.log('🔄 [Quiz Published] Requesting updated quiz history...');
          sendMessage({
            type: 'quiz_history_request',
            data: { session_id: actualSessionId }
          });
        }
        
        // Show notification to students
        if (!isHost) {
          toast.success(`📝 New quiz available: ${data.name}`, {
            duration: 5000,
          });
        } else {
          toast.success(`Quiz "${data.name}" published to students!`);
        }
        // Update quiz status in list (backend sends quiz_id, not id)
        setQuizzes(prev => prev.map(q => 
          q.id === data.quiz_id 
            ? { ...q, status: 'in_progress', published_at: data.published_at } 
            : q
        ));
        break;
        
      case 'quiz_data':
        console.log('📝 [PositionCalculator] Quiz data received:', data);
        console.log('📝 [PositionCalculator] Questions:', data.questions);
        if (data.questions && data.questions.length > 0) {
          console.log('📝 [PositionCalculator] First question:', JSON.stringify(data.questions[0], null, 2));
          console.log('📝 [PositionCalculator] First question correct_answer field:', data.questions[0].correct_answer);
          console.log('📝 [PositionCalculator] Is correct_answer empty?', data.questions[0].correct_answer === '' || data.questions[0].correct_answer === undefined);
        }
        // Quiz data received after student requests it
        setActiveQuiz({
          ...data,
          questions: data.questions // Questions without correct answers
        });
        setIsTakeQuizOpen(true);
        break;
        
      case 'quiz_results':
        console.log('📝 [PositionCalculator] Quiz results received:', data);
        // Student's quiz results after submission
        setQuizResults(data);
        setHasSubmittedQuiz(true);
        
        // ✅ Update completed_submissions locally so UI knows this quiz is done
        setQuizHistory(prev => {
          const newSubmission = {
            quiz_id: data.quiz_id,
            score: data.score,
            total_questions: data.total,
            percentage: data.percentage,
            submitted_at: new Date().toISOString()
          };
          
          // Avoid duplicates
          const alreadyCompleted = prev.completed_submissions?.some(sub => sub.quiz_id === data.quiz_id);
          if (alreadyCompleted) {
            return prev;
          }
          
          return {
            ...prev,
            completed_submissions: [...(prev.completed_submissions || []), newSubmission]
          };
        });
        
        console.log('✅ [Quiz Completion] Added quiz to completed_submissions:', data.quiz_id);
        // DON'T close modal - results will be shown inside TakeQuizModal
        // setIsTakeQuizOpen(false); // REMOVED - modal stays open
        
        // Don't show toast either - results are in modal
        // const percentage = ((data.score / data.total) * 100).toFixed(1);
        // toast.success(`Quiz submitted! Score: ${data.score}/${data.total} (${percentage}%)`, { duration: 6000 });
        break;
        
      case 'quiz_ended':
        console.log('📝 [PositionCalculator] Quiz ended:', data);
        toast('Quiz has ended', { icon: 'ℹ️' });
        
        // ✅ Request fresh quiz history when quiz ends (for members)
        if (!isHost && actualSessionId) {
          console.log('🔄 [Quiz Ended] Requesting updated quiz history...');
          sendMessage({
            type: 'quiz_history_request',
            data: { session_id: actualSessionId }
          });
        }
        
        // If student is currently taking quiz, auto-submit
        if (isTakeQuizOpen && !hasSubmittedQuiz) {
          toast.error('Host ended the quiz. Auto-submitting...', { duration: 3000 });
          // The TakeQuizModal will handle auto-submission via its own effect
        }
        
        setActiveQuiz(null);
        
        // Clear quiz localStorage when quiz ends
        if (activeQuiz?.id) {
          localStorage.removeItem(`quiz_answers_${activeQuiz.id}`);
        }
        
        // Update quiz status in list
        setQuizzes(prev => prev.map(q => q.id === data.quiz_id ? { ...q, status: 'completed' } : q));
        break;
        
      case 'quiz_progress':
        console.log('📝 [PositionCalculator] Quiz progress received:', data);
        // Save progress data to state for display in QuizManagementModal
        setQuizProgress(data);
        // Also display in toast
        const avgDisplay = data.average_score != null ? data.average_score.toFixed(1) : '0';
        toast(`📊 Progress: ${data.submitted_count} submission(s), Average Score: ${avgDisplay}`, {
          duration: 5000
        });
        break;
        
      case 'capture_preview_frames':
        // Lobby requests frame capture for LiveShare/WatchFrom preview
        console.log('📸 [PositionCalculator] ========================================');
        console.log('📸 [PositionCalculator] FRAME CAPTURE REQUEST RECEIVED');
        console.log(`   ├─ Session ID: ${data?.session_id}`);
        console.log(`   ├─ Source: ${data?.source}`);
        console.log(`   ├─ Is Host: ${isHost}`);
        console.log(`   ├─ Screen Sharing: ${isScreenSharingActive}`);
        console.log(`   └─ Blackboard Media: ${blackboardMedia ? 'YES' : 'NO'}`);
        
        if (isHost && (isScreenSharingActive || blackboardMedia)) {
          console.log('   └─ ✅ Conditions met - Starting frame capture...');
          console.log('📸 [PositionCalculator] ========================================');
          handleCapturePreviewFrames();
        } else {
          console.log('   └─ ⏭️ Skipping - not host or no media active');
          console.log('📸 [PositionCalculator] ========================================');
        }
        break;
      
      case 'quiz_submission_received':
        console.log('📝 [PositionCalculator] Student submitted:', data);
        // Auto-update quiz progress if viewing same quiz
        if (data.new_average_score !== undefined && quizProgress && quizProgress.quiz_id === data.quiz_id) {
          setQuizProgress(prev => ({
            ...prev,
            submitted_count: (prev.submitted_count || 0) + 1,
            average_score: data.new_average_score
          }));
        }
        // Notify host of student submission
        toast(`${data.username} submitted: ${data.score}/${data.total}`, {
          icon: '✅',
          duration: 3000
        });
        break;
        
      case 'media_play':
        console.log('🎬 [PositionCalculator] Media play received:', data);
        console.log('🎬 [PositionCalculator] data.url:', data.url);
        console.log('🎬 [PositionCalculator] data.file_url:', data.file_url);
        console.log('🎬 [PositionCalculator] data.type:', data.type);
        
        // ✅ Ensure absolute URL (safety net)
        let mediaUrl = data.url || data.file_url;
        if (mediaUrl && !mediaUrl.startsWith('http')) {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
          mediaUrl = `${API_BASE_URL}/${mediaUrl}`;
          console.log('🎬 [PositionCalculator] Converted to absolute URL:', mediaUrl);
        }
        
        const mediaState = {
          file_url: mediaUrl,
          url: mediaUrl,
          mediaUrl: mediaUrl, // ✅ Cinema expects this property
          type: data.type,
          title: data.title || 'Media',
          timestamp: data.timestamp || 0,
          playing: true
        };
        console.log('🎬 [PositionCalculator] Setting blackboardMedia:', {
          mediaState,
          hasMediaUrl: !!mediaState.mediaUrl,
          dataFromWebSocket: data,
          comparisonWithCinema: {
            cinema_expects: 'mediaUrl property',
            we_have: 'file_url and url properties',
            missing: !mediaState.mediaUrl ? 'mediaUrl' : 'none'
          }
        });
        setBlackboardMedia(mediaState);
        break;
        
      case 'playback_control':
        // ✅ Handle playback_control with latency compensation (like 3D Cinema)
        // ⚠️ playback_control sends properties at root level, not nested under data
        const playbackData = data || message; // Fallback to message if data is undefined
        
        console.log('📩 [Lecture Hall] playback_control received:', {
          hasData: !!data,
          hasMessage: !!message,
          senderId: playbackData?.sender_id,
          currentUserId: currentUser?.id,
          isSender: playbackData?.sender_id === currentUser?.id,
          hasFilePath: !!playbackData?.file_path,
          fullData: playbackData
        });
        
        if (!playbackData) {
          console.log('⚠️ [playback_control] No playback data, breaking');
          break;
        }
        if (playbackData.sender_id && playbackData.sender_id === currentUser?.id) {
          console.log('⚠️ [playback_control] Message from self, breaking');
          break;
        }
        if (playbackData.file_path) {
          // 🎯 Latency compensation: adjust seek time for network delay
          const now = Date.now();
          const latency = now - (playbackData.timestamp || now); // Fallback to 0 if no timestamp
          const adjustedTime = (playbackData.seek_time || 0) + (latency / 1000);
          
          console.log('⏱️ [Lecture Hall] Playback control received:', {
            command: playbackData.command,
            seek_time: playbackData.seek_time,
            latency_ms: latency,
            adjusted_time: adjustedTime,
            current_isPlaying: blackboardMedia?.playing,
            will_change_playState: playbackData.command === "play" || playbackData.command === "pause"
          });
          
          const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
          const fileUrl = playbackData.file_url || playbackData.file_path;
          const mediaUrl = fileUrl.startsWith('http') ? fileUrl : `${baseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
          
          // 🎯 Store pending seek time, will be applied after video loads
          loadStartTimeRef.current = Date.now(); // ⏱️ Track loading start for compensation
          setPendingSeekTime(adjustedTime);
          
          const newBlackboardMedia = {
            type: 'upload',
            file_url: mediaUrl,
            url: mediaUrl,
            mediaUrl: mediaUrl,
            id: playbackData.media_item_id,
            media_id: playbackData.media_item_id,
            title: playbackData.original_name || 'Unknown Media',
            timestamp: adjustedTime,
            playing: playbackData.command === "play" || playbackData.command === "pause" ? playbackData.command === "play" : true
          };
          
          console.log('✅ [Lecture Hall] Setting blackboardMedia from playback_control:', {
            mediaUrl,
            timestamp: adjustedTime,
            playing: newBlackboardMedia.playing,
            title: newBlackboardMedia.title,
            fullMedia: newBlackboardMedia
          });
          
          setBlackboardMedia(newBlackboardMedia);
          
          // 🎯 Only update play/pause for explicit play/pause commands, not seek-only
          if (playbackData.command === "play" || playbackData.command === "pause") {
            console.log(`🎬 [Lecture Hall] ${playbackData.command === "play" ? "Playing" : "Pausing"} video from playback_control`);
          }
        } else {
          console.log('⚠️ [playback_control] No file_path in playbackData, cannot set media');
        }
        break;
        
      case 'media_pause':
        console.log('⏸️ [PositionCalculator] Media pause:', data);
        setBlackboardMedia(prev => prev ? { ...prev, playing: false, timestamp: data.timestamp } : null);
        break;
        
      case 'media_seek':
        console.log('⏩ [PositionCalculator] Media seek:', data);
        setBlackboardMedia(prev => prev ? { ...prev, timestamp: data.timestamp } : null);
        break;
        
      case 'media_ended':
        console.log('🏁 [PositionCalculator] Media ended:', {
          data,
          currentMedia: blackboardMedia,
          willSetEndedFlag: true
        });
        toast('Video ended', { icon: '🏁' });
        // Clear blackboard media or show ended state
        setBlackboardMedia(prev => {
          const newState = prev ? { ...prev, playing: false, ended: true } : null;
          console.log('🎬 [PositionCalculator] Updated blackboardMedia with ended flag:', newState);
          return newState;
        });
        break;
        
      case 'liveshare_started':
        console.log('🎥 [LiveShare] Received liveshare_started:', data);
        
        // If this is the host themselves, skip (already displaying locally)
        if (data.user_id === currentUser?.id) {
          console.log('🎥 [LiveShare] Skipping - this is the host');
          break;
        }
        
        // Member needs to subscribe to host's screen share track
        if (!livekitRoom) {
          console.error('❌ [LiveShare] LiveKit room not available');
          break;
        }
        
        // Find the host's participant
        const hostParticipant = Array.from(livekitRoom.remoteParticipants.values()).find(
          p => p.identity === `user-${data.user_id}-${p.identity.split('-')[2]}`
        );
        
        if (!hostParticipant) {
          console.error('❌ [LiveShare] Host participant not found');
          break;
        }
        
        console.log('✅ [LiveShare] Found host participant:', hostParticipant.identity);
        
        // ✅ STRATEGY 1: Try direct subscription using track SIDs (instant)
        let screenTrackPub = null;
        let cameraTrackPub = null;
        
        if (data.screen_track_sid) {
          screenTrackPub = hostParticipant.getTrackPublicationBySid(data.screen_track_sid);
          if (screenTrackPub) {
            console.log('⚡ [LiveShare] Direct screen track subscription via SID:', data.screen_track_sid);
          } else {
            console.warn('⚠️ [LiveShare] Screen track SID not found yet:', data.screen_track_sid);
          }
        }
        
        if (data.camera_track_sid) {
          cameraTrackPub = hostParticipant.getTrackPublicationBySid(data.camera_track_sid);
          if (cameraTrackPub) {
            console.log('⚡ [LiveShare] Direct camera track subscription via SID:', data.camera_track_sid);
          } else {
            console.warn('⚠️ [LiveShare] Camera track SID not found yet:', data.camera_track_sid);
          }
        }
        
        // ✅ FALLBACK: Use source-based subscription if SIDs not available
        if (!screenTrackPub) {
          screenTrackPub = hostParticipant.getTrackPublication(Track.Source.ScreenShare);
        }
        if (!cameraTrackPub) {
          cameraTrackPub = hostParticipant.getTrackPublication(Track.Source.Camera);
        }
        
        if (!screenTrackPub && !cameraTrackPub) {
          console.warn('⚠️ [LiveShare] No tracks published yet, will wait for track_published event');
          // Tracks will be handled by TrackPublished event listener
          break;
        }
        
        // Build media state with available tracks
        let screenStream = null;
        let cameraStream = null;
        
        if (screenTrackPub?.track) {
          screenStream = new MediaStream([screenTrackPub.track.mediaStreamTrack]);
          console.log('✅ [LiveShare] Member subscribed to host screen share');
        } else if (screenTrackPub) {
          screenTrackPub.setSubscribed(true);
          console.log('⏳ [LiveShare] Subscribed to screen share, waiting...');
        }
        
        if (cameraTrackPub?.track) {
          cameraStream = new MediaStream([cameraTrackPub.track.mediaStreamTrack]);
          console.log('✅ [LiveShare] Member subscribed to host camera');
        } else if (cameraTrackPub) {
          cameraTrackPub.setSubscribed(true);
          console.log('⏳ [LiveShare] Subscribed to camera, waiting...');
        }
        
        // Only set blackboard media if we have at least one track ready
        if (screenStream || cameraStream) {
          setBlackboardMedia({
            type: 'liveshare',
            stream: screenStream,
            cameraStream: cameraStream,
            playing: true
          });
          
          // ✅ Set liveShareMode so camera fills board in camera-only mode
          setLiveShareMode(data.mode);
          setIsScreenSharingActive(true);
          
          toast.success('Host started LiveShare');
        }
        break;
        
      case 'liveshare_ended':
        console.log('🎥 [LiveShare] ✅ RECEIVED liveshare_ended message from host:', data);
        console.log('🧪 [LiveShare] Current blackboard state before clearing:', blackboardMedia);
        console.log('🧪 [LiveShare] Current liveShareMode:', liveShareMode);
        console.log('🧪 [LiveShare] Current isScreenSharingActive:', isScreenSharingActive);
        
        // 🔄 Clear blackboard for all participants (returns to white/clear state)
        setBlackboardMedia(null);
        setLiveShareMode(null);
        setIsScreenSharingActive(false);
        
        console.log('✅ [LiveShare] Blackboard cleared for member - should show white board now');
        toast('LiveShare ended');
        break;
        
      case 'quiz_deleted':
        console.log('📝 [PositionCalculator] Quiz deleted:', data);
        toast.success(`Quiz deleted`);
        // Remove from quiz list
        setQuizzes(prev => prev.filter(q => q.id !== data.quiz_id));
        break;
        
      case 'quiz_history':
        console.log('📚 [PositionCalculator] Received quiz history:', data);
        // Store quiz history for member view
        setQuizHistory({
          active_quizzes: data.active_quizzes || [],
          completed_submissions: data.completed_submissions || []
        });
        break;

      case 'quiz_export_data':
        console.log('📥 [PositionCalculator] Received quiz export data:', data);
        // Dismiss loading toast
        toast.dismiss(`export-${data.quiz?.id || 'unknown'}`);
        
        // Create export data object
        const exportData = {
          quiz: data.quiz,
          responses: data.responses || [],
          statistics: {
            total_submissions: data.submitted_count || 0,
            average_score: data.average_score || 0,
            pass_rate: data.pass_rate || 0,
            total_questions: data.total_questions || 0
          },
          exported_at: new Date().toISOString(),
          exported_by: currentUser?.username || 'Unknown'
        };

        // ✅ Store in state for QuizManagementModal to access
        // The modal will handle the actual export (PDF/DOCX)
        setQuizExportData(exportData);
        
        console.log('📊 [PositionCalculator] Export data stored, QuizManagementModal will handle download');
        break;
        
      case 'session_ended':
        console.log('📛 [PositionCalculator] Session ended', {
          is_temporary: message.data?.is_temporary,
          room_id: message.data?.room_id
        });
        toast.error('Lecture hall session has ended');
        // ✅ Clear private messages and unread counts
        setPrivateMessages({});
        setUnreadMessages({});
        
        // ✅ Redirect based on room type: lobby for instant watch, room page for persistent
        const isTemporary = message.data?.is_temporary === true;
        const redirectPath = isTemporary ? '/lobby' : `/rooms/${roomId}`;
        console.log(`🧭 [PositionCalculator] Redirecting to ${redirectPath} (instant watch: ${isTemporary})`);
        
        setTimeout(() => {
          navigate(redirectPath);
        }, 2000);
        break;
        
      default:
        // Unknown message type - silently ignore
        break;
    }
    } // End of message processing loop
    
    // Update last processed index
    lastProcessedIndexRef.current = messages.length - 1;
    console.log(`✅ [Message Processing] Processed up to index ${lastProcessedIndexRef.current}`);
  }, [messages, navigate, roomId, handleSeatSwapMessage, currentUser?.id, isHost, setDiscussionMode]);
  
  // Show seat swap request notification
  useEffect(() => {
    if (seatSwapRequest) {
      setSwapNotification(seatSwapRequest);
    } else {
      setSwapNotification(null);
    }
  }, [seatSwapRequest]);
  
  // Keyboard controls for camera movement - wait for controls to be ready
  useEffect(() => {
    // Wait for OrbitControls to be ready
    const checkInterval = setInterval(() => {
      if (controlsRef.current) {
        setControlsReady(true);
        clearInterval(checkInterval);
      }
    }, 100);
    
    return () => clearInterval(checkInterval);
  }, []);
  
  // Setup keyboard controls once OrbitControls is ready
  useEffect(() => {
    // ✅ Only activate WASDCV if movement toggle is enabled
    if (!controlsReady || !controlsRef.current || !freeCameraMovement) {
      return;
    }
    
    const moveSpeed = 0.5;
    const keysPressed = {};

    const handleKeyDown = (e) => {
      // ✅ Disable shortcuts when chat or quiz modals are open
      if (showChatHome || isChatOpen || privateChatOpen || isQuizManagementOpen || isMakeQuizOpen || isTakeQuizOpen) return;
      
      const key = e.key.toLowerCase();
      
      // Prevent default for WASD and CV to avoid page scrolling
      if (['w', 'a', 's', 'd', 'c', 'v'].includes(key)) {
        e.preventDefault();
      }
      
      keysPressed[key] = true;
    };

    const handleKeyUp = (e) => {
      // ✅ Disable shortcuts when chat or quiz modals are open
      if (showChatHome || isChatOpen || privateChatOpen || isQuizManagementOpen || isMakeQuizOpen || isTakeQuizOpen) return;
      
      const key = e.key.toLowerCase();
      keysPressed[key] = false;
    };

    const moveCamera = () => {
      if (!controlsRef.current) return;

      const camera = controlsRef.current.object;
      const target = controlsRef.current.target;

      // Calculate forward and right vectors
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0; // Keep movement horizontal
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(camera.up, forward).normalize();

      let moved = false;

      // WASD movement
      if (keysPressed['w']) {
        camera.position.addScaledVector(forward, moveSpeed);
        target.addScaledVector(forward, moveSpeed);
        moved = true;
      }
      if (keysPressed['s']) {
        camera.position.addScaledVector(forward, -moveSpeed);
        target.addScaledVector(forward, -moveSpeed);
        moved = true;
      }
      if (keysPressed['a']) {
        camera.position.addScaledVector(right, moveSpeed);
        target.addScaledVector(right, moveSpeed);
        moved = true;
      }
      if (keysPressed['d']) {
        camera.position.addScaledVector(right, -moveSpeed);
        target.addScaledVector(right, -moveSpeed);
        moved = true;
      }

      // C/V for vertical movement
      if (keysPressed['c']) {
        camera.position.y += moveSpeed;
        target.y += moveSpeed;
        moved = true;
      }
      if (keysPressed['v']) {
        camera.position.y -= moveSpeed;
        target.y -= moveSpeed;
        moved = true;
      }

      if (moved) {
        controlsRef.current.update();
      }
    };

    const animationLoop = setInterval(moveCamera, 16); // ~60fps

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      clearInterval(animationLoop);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [controlsReady, freeCameraMovement, showChatHome, isChatOpen, privateChatOpen]); // Re-run when controlsReady or freeCameraMovement changes
  
  // Handle camera movement
  const handleCameraMove = useCallback(() => {
    if (controlsRef.current && controlsRef.current.object) {
      const camera = controlsRef.current.object;
      const newPos = {
        x: parseFloat(camera.position.x.toFixed(3)),
        y: parseFloat(camera.position.y.toFixed(3)),
        z: parseFloat(camera.position.z.toFixed(3))
      };
      // Only update if position actually changed
      setCameraPosition(prev => {
        if (prev.x === newPos.x && prev.y === newPos.y && prev.z === newPos.z) {
          return prev;
        }
        return newPos;
      });
    }
  }, []);
  
  // Handle model loaded - extract meshes
  const handleModelLoaded = useCallback((meshes) => {
    // Only update if meshes array length changed (avoid re-renders from same data)
    setModelMeshes(prev => {
      if (prev.length === meshes.length) {
        return prev;
      }
      return meshes;
    });
    // console.log('Model meshes loaded:', meshes);
  }, []);
  
  // Snap camera to seat using saved or extrapolated position
  const snapCameraToSeat = (seat) => {
    console.log('🎥 [snapCameraToSeat] Called with seat:', seat?.id, 'savedCameraPositions has entry?', !!savedCameraPositions[seat?.id]);
    if (!controlsRef.current || !seat) return;
    const camera = controlsRef.current.object;
    
    // Use saved position if available, otherwise use seat marker position as fallback
    let cameraPos;
    let lookingAtPos;
    
    if (savedCameraPositions[seat.id]) {
      cameraPos = savedCameraPositions[seat.id].position;
      lookingAtPos = savedCameraPositions[seat.id].lookingAt;
    } else {
      // Fallback: use seat marker position and default to blackboard
      const [x, y, z] = seat.position;
      cameraPos = { x, y, z };
      lookingAtPos = { x: 3.533, y: 76.352, z: -218 }; // Default to blackboard
    }
    
    // Store the target position so we can maintain it across renders
    window.targetCameraPosition = { ...cameraPos };
    window.targetLookingAt = { ...lookingAtPos };
    
    // Save current OrbitControls state
    const wasEnabled = controlsRef.current.enabled;
    const wasPanEnabled = controlsRef.current.enablePan;
    const wasRotateEnabled = controlsRef.current.enableRotate;
    const wasZoomEnabled = controlsRef.current.enableZoom;
    
    // Temporarily enable all controls so update() works correctly
    controlsRef.current.enabled = true;
    controlsRef.current.enablePan = true;
    controlsRef.current.enableRotate = true;
    controlsRef.current.enableZoom = true;
    
    // Set both target and camera position
    controlsRef.current.target.set(
      lookingAtPos.x,
      lookingAtPos.y,
      lookingAtPos.z
    );
    
    camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
    
    // Force OrbitControls to update its internal state from the new camera position
    controlsRef.current.update();
    
    // Restore original OrbitControls state
    controlsRef.current.enabled = wasEnabled;
    controlsRef.current.enablePan = wasPanEnabled;
    controlsRef.current.enableRotate = wasRotateEnabled;
    controlsRef.current.enableZoom = wasZoomEnabled;
  };
  
  // Auth loading check - AFTER all hooks
  if (authLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-4xl mb-4">🎓</div>
          <div className="text-xl">Loading lecture hall...</div>
        </div>
      </div>
    );
  }
  
  if (!currentUser) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <div className="text-xl">Please log in to access the lecture hall</div>
        </div>
      </div>
    );
  }
  
  if (!roomId) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-xl">No room ID provided</div>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            Go to Lobby
          </button>
        </div>
      </div>
    );
  }
  
  // Handle click on model
  const handleModelClick = (point) => {
    setClickedPosition({
      x: point.x.toFixed(3),
      y: point.y.toFixed(3),
      z: point.z.toFixed(3)
    });
  };
  
  // Save current position for current seat
  const handleSavePosition = () => {
    const newSeat = {
      seatNumber: currentSeatNumber,
      position: { ...cameraPosition }
    };
    
    // Replace if seat number already exists, otherwise add
    const existingIndex = savedSeats.findIndex(s => s.seatNumber === currentSeatNumber);
    if (existingIndex >= 0) {
      const updated = [...savedSeats];
      updated[existingIndex] = newSeat;
      setSavedSeats(updated);
    } else {
      setSavedSeats([...savedSeats, newSeat]);
    }
    
    // Auto-increment to next seat
    if (currentSeatNumber < totalSeats) {
      setCurrentSeatNumber(currentSeatNumber + 1);
    }
  };
  
  // Export coordinates
  const handleExport = () => {
    const sortedSeats = [...savedSeats].sort((a, b) => a.seatNumber - b.seatNumber);
    
    // Format as JavaScript array
    const formatted = sortedSeats.map(seat => 
      `  { seatNumber: ${seat.seatNumber}, position: [${seat.position.x}, ${seat.position.y}, ${seat.position.z}] }`
    ).join(',\n');
    
    const output = `[\n${formatted}\n]`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(output).then(() => {
      alert('Coordinates copied to clipboard!');
    });
  };
  
  // Export all mesh data
  const handleExportMeshData = () => {
    const formatted = modelMeshes.map(mesh => 
      `${mesh.name || 'Unnamed'}: [${mesh.position.x}, ${mesh.position.y}, ${mesh.position.z}]`
    ).join('\n');
    
    const output = `Total Meshes: ${modelMeshes.length}\n\n${formatted}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(output).then(() => {
      alert(`Mesh data copied! (${modelMeshes.length} meshes)`);
    });
  };
  
  // Toggle marker visibility
  const toggleMarker = (index) => {
    setVisibleMarkers(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Show all markers
  const showAllMarkers = () => {
    const all = {};
    modelMeshes.forEach((_, idx) => {
      all[idx] = true;
    });
    setVisibleMarkers(all);
  };
  
  // Hide all markers
  const hideAllMarkers = () => {
    setVisibleMarkers({});
  };
  
  // Auto-import from seat meshes
  const handleAutoImportSeats = () => {
    const seatMeshes = modelMeshes.filter(m => 
      m.name.toLowerCase().includes('seat') || 
      m.name.toLowerCase().includes('chair') ||
      m.name.toLowerCase().includes('desk')
    );
    
    if (seatMeshes.length === 0) {
      alert('No seat meshes found! Try searching for different keywords.');
      return;
    }
    
    const imported = seatMeshes.map((mesh, index) => ({
      seatNumber: index + 1,
      position: mesh.position
    }));
    
    setSavedSeats(imported);
    alert(`Imported ${imported.length} seat positions from model meshes!`);
  };
  
  // Load generated seats for preview
  const handleLoadGeneratedSeats = () => {
    // Generated lecture hall seats (145 total: 144 student + 1 host)
    const generatedSeats = [];
    let seatId = 1;
    
    // Seats to raise by 10%
    const seatsToRaise = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134];
    
    // Column 1: 5 seats per row, 8 rows (seats 1-40) - Right to Left
    const col1_x = [-92.52, -103.504, -114.318, -125.345, -135.921];
    const startZ = -132;
    const startY = 30.5;
    const rowSpacingZ = 27.5;
    const rowSpacingY = 9.875;
    
    for (let row = 0; row < 8; row++) {
      const z = startZ + (row * rowSpacingZ);
      let y = startY + (row * rowSpacingY);
      const zVariation = (row % 2) * 0.5;
      
      // Raise last 2 rows (rows 6-7, seats 31-40) by 10%
      if (row >= 6) {
        y = y * 1.1;
      }
      
      for (let seat = 0; seat < 5; seat++) {
        const currentSeatId = seatId;
        let finalY = y;
        
        // Apply 10% height increase for specific seats
        if (seatsToRaise.includes(currentSeatId)) {
          finalY = y * 1.1;
        }
        
        generatedSeats.push({
          id: seatId++,
          position: [col1_x[seat], finalY, z + zVariation]
        });
      }
    }
    
    // Column 2: 8 seats per row, 8 rows (seats 41-104) - Left to Right
    // Calculate average X positions from provided data
    const col2_row1 = [-35.656, -24.65, -12.68, -3.16, 6.854, 18.36, 28.337, 39.322];
    const col2_row2 = [-34.771, -25.222, -13.802, -2.782, 6.739, 16.231, 28.751, 37.764];
    const col2_row8 = [-34.361, -24.385, -13.371, -3.857, 7.612, 16.611, 28.632, 38.609];
    
    const col2_x = [];
    for (let i = 0; i < 8; i++) {
      col2_x.push((col2_row1[i] + col2_row2[i] + col2_row8[i]) / 3);
    }
    
    for (let row = 0; row < 8; row++) {
      const z = startZ + (row * rowSpacingZ);
      let y = startY + (row * rowSpacingY);
      const zVariation = (row % 2) * 0.5;
      
      // Raise last 2 rows (rows 6-7, seats 89-104) by 10%
      if (row >= 6) {
        y = y * 1.1;
      }
      
      for (let seat = 0; seat < 8; seat++) {
        const currentSeatId = seatId;
        let finalY = y;
        
        // Apply 10% height increase for specific seats
        if (seatsToRaise.includes(currentSeatId)) {
          finalY = y * 1.1;
        }
        
        generatedSeats.push({
          id: seatId++,
          position: [col2_x[seat], finalY, z + zVariation]
        });
      }
    }
    
    // Column 3: 5 seats per row, 8 rows (seats 105-144) - Left to Right
    const col3_row1 = [96.629, 107.578, 117.611, 127.561, 138.635];
    const col3_row2 = [96.344, 106.439, 117.471, 128.441, 139.432];
    
    const col3_x = [];
    for (let i = 0; i < 5; i++) {
      col3_x.push((col3_row1[i] + col3_row2[i]) / 2);
    }
    
    for (let row = 0; row < 8; row++) {
      const z = startZ + (row * rowSpacingZ);
      let y = startY + (row * rowSpacingY);
      const zVariation = (row % 2) * 0.5;
      
      // Raise last 2 rows (rows 6-7, seats 135-144) by 10%
      if (row >= 6) {
        y = y * 1.1;
      }
      
      for (let seat = 0; seat < 5; seat++) {
        const currentSeatId = seatId;
        let finalY = y;
        
        // Apply 10% height increase for specific seats
        if (seatsToRaise.includes(currentSeatId)) {
          finalY = y * 1.1;
        }
        
        generatedSeats.push({
          id: seatId++,
          position: [col3_x[seat], finalY, z + zVariation]
        });
      }
    }
    
    // Host/Teacher seat (seat 145) - Front of class facing audience
    generatedSeats.push({
      id: 145,
      position: [7.121, 18.737, -229.244],
      isHost: true
    });
    
    setPreviewSeats(generatedSeats);
    // Don't auto-enable preview - let user control via toggle
    // setShowPreview(true);
    setShowSeatCycling(true);
    // ✅ Start at user's current seat, not seat 0
    const userCurrentSeatId = userSeats[currentUser?.id];
    const userSeatIndex = generatedSeats.findIndex(s => s.id === userCurrentSeatId);
    console.log('🎓 [Generate Seats Button] User seat:', userCurrentSeatId, 'Index:', userSeatIndex);
    setCurrentSeatIndex(userSeatIndex >= 0 ? userSeatIndex : 0);
    
    // Auto-snap camera to first seat - wait for savedCameraPositions to load
    setTimeout(() => {
      if (generatedSeats.length > 0 && Object.keys(savedCameraPositions).length > 0) {
        snapCameraToSeat(generatedSeats[0]);
      }
    }, 300); // Increased delay to ensure state is loaded
  };
  
  // Delete a saved seat
  const handleDeleteSeat = (seatNumber) => {
    setSavedSeats(savedSeats.filter(s => s.seatNumber !== seatNumber));
  };
  
  // Open save camera modal
  const handleOpenSaveModal = () => {
    if (!controlsRef.current) {
      alert('Camera not initialized!');
      return;
    }
    
    // Pre-fill with current seat if selected, otherwise use currentSeatIndex
    if (selectedSeatId) {
      setModalSeatNumber(selectedSeatId);
    } else if (previewSeats[currentSeatIndex]) {
      setModalSeatNumber(previewSeats[currentSeatIndex].id);
    }
    
    setIsSaveModalOpen(true);
  };
  
  // Save camera position from modal
  const handleSaveCameraFromModal = () => {
    if (!controlsRef.current || !modalSeatNumber) {
      alert('Please enter a valid seat number!');
      return;
    }
    
    const camera = controlsRef.current.object;
    // Host (seat 145) looks at middle of column 2 (seat 72 position), others look at blackboard
    const isHost = modalSeatNumber === 145;
    const whiteboardCenter = [3.533, 76.352, -218];
    const middleColumn2 = [38.918, 61.470, -47.187]; // Seat 72 position - middle of column 2
    const lookingAtTarget = isHost ? middleColumn2 : whiteboardCenter;
    
    const position = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z
    };
    
    const lookingAt = {
      x: lookingAtTarget[0],
      y: lookingAtTarget[1],
      z: lookingAtTarget[2]
    };
    
    setSavedCameraPositions(prev => {
      const updated = {
        ...prev,
        [modalSeatNumber]: { position, lookingAt }
      };
      console.log(`✅ Saved camera for Seat ${modalSeatNumber}:`, { position, lookingAt });
      console.log(`📊 Total saved seats now: ${Object.keys(updated).length}`);
      return updated;
    });
    
    setIsSaveModalOpen(false);
    setSelectedSeatId(modalSeatNumber);
  };
  
  // Handler functions for taskbar and interactions
  // Raise hand (student action)
  const handleRaiseHand = () => {
    if (!currentUser || !sendMessage) return;
    
    const mySeatId = userSeats[currentUser.id];
    
    setHandRaised(true);
    sendMessage({
      type: 'raise_hand',
      user_id: currentUser.id,
      username: currentUser.username,
      seat_id: mySeatId || null,
      session_id: finalSessionId
    });
    toast('Hand raised! Waiting for host approval...');
  };
  
  // Lower hand (student cancels request)
  const handleLowerHand = () => {
    if (!currentUser || !sendMessage) return;
    
    setHandRaised(false);
    sendMessage({
      type: 'lower_hand',
      user_id: currentUser.id,
      session_id: finalSessionId
    });
  };
  
  // Approve speaker (host action)
  const handleApproveSpeaker = (userId) => {
    if (!sendMessage) return;
    
    sendMessage({
      type: 'approve_speaker',
      target_user_id: userId,
      session_id: finalSessionId
    });
    toast.success('Speaker approved!');
  };
  
  // Revoke speaker (host action)
  const handleRevokeSpeaker = (userId) => {
    if (!sendMessage) return;
    
    sendMessage({
      type: 'revoke_speaker',
      target_user_id: userId,
      session_id: finalSessionId
    });
    toast.warning('Speaker permission revoked');
  };
  
  // Open room chat
  const handleOpenRoomChat = async () => {
    setShowChatHome(false);
    setPrivateChatOpen(false);
    setIsChatOpen(true);
    setIsChatLoading(true);
    
    try {
      const response = await getChatHistory(roomId, finalSessionId);
      const messages = response.messages || [];
      console.log(`💬 [PositionCalculator] Loaded ${messages.length} chat messages:`, messages);
      setSessionChatMessages(messages);
    } catch (error) {
      console.error('Error loading chat history:', error);
      toast.error('Failed to load chat history');
    } finally {
      setIsChatLoading(false);
    }
  };
  
  // Open private chat with user
  const handleOpenPrivateChat = (userOrId) => {
    // ✅ Handle both user object (from ChatHomeModal) and userId (legacy)
    const userId = typeof userOrId === 'object' ? userOrId.id : userOrId;
    const userObj = typeof userOrId === 'object' ? userOrId : watchSessionMembers.find(m => m.id === userOrId);
    
    setShowChatHome(false);
    setIsChatOpen(false);
    setPrivateChatUserId(Number(userId));
    setSelectedChatUser(userObj); // ✅ Set user object for modal
    setPrivateChatOpen(true);
    
    // ✅ Mark messages from this user as read
    setUnreadMessages(prev => ({
      ...prev,
      [userId]: 0
    }));
  };
  
  // Send room chat message
  const handleSendRoomMessage = () => {
    if (!sendMessage || !currentUser || !newMessage.trim()) return;
    
    const chatMessage = {
      type: 'chat_message',
      data: {
        message: newMessage.trim(),
        session_id: finalSessionId,
        user_id: currentUser.id,
        username: currentUser.username,
        is_private: false
      }
    };
    
    sendMessage(chatMessage);
    setNewMessage(''); // Clear input after sending
  };
  
  // Send private message
  const handleSendPrivateMessage = (message) => {
    if (!sendMessage || !currentUser || !privateChatUserId) return;
    
    // Backend expects 'private_chat_message' type with 'to_user_id'
    const messageData = {
      type: 'private_chat_message',
      data: {
        to_user_id: privateChatUserId,
        message: message
      }
    };
    
    sendMessage(messageData);
    
    // ✅ Optimistic update: Add sent message immediately so sender sees it
    const optimisticMsg = {
      message: message,
      from_user_id: currentUser.id,
      to_user_id: privateChatUserId,
      timestamp: new Date().toISOString(),
      _optimistic: true, // Mark as optimistic for deduplication
      _tempId: Date.now() // Temporary ID for deduplication
    };
    
    setPrivateMessages(prev => ({
      ...prev,
      [privateChatUserId]: [...(prev[privateChatUserId] || []), optimisticMsg]
    }));
  };
  
  // Handle seats modal - Toggle on/off
  const handleSeatsClick = () => {
    setIsSeatsModalOpen(prev => !prev);
  };
  
  // Handle taking a seat
  const handleTakeSeat = (seatId) => {
    console.log('🪑 [handleTakeSeat] Called with seatId:', seatId, 'type:', typeof seatId);
    
    if (!sendMessage || !currentUser) {
      console.error('❌ [handleTakeSeat] Missing sendMessage or currentUser');
      return;
    }
    
    const newSeat = getLectureHallSeatById(seatId);
    console.log('🪑 [handleTakeSeat] getLectureHallSeatById returned:', newSeat);
    
    if (!newSeat) {
      console.error('❌ [handleTakeSeat] No seat found for ID:', seatId);
      return;
    }
    
    setCurrentSeat(newSeat);
    
    // ✅ Immediately update userSeats (don't wait for backend echo)
    setUserSeats(prev => ({
      ...prev,
      [currentUser.id]: seatId
    }));
    console.log('✅ [handleTakeSeat] Immediately updated userSeats:', { [currentUser.id]: seatId });
    
    const message = {
      type: 'take_seat',
      seat_id: seatId,
      row: newSeat.row,
      col: newSeat.column,
      user_id: currentUser.id
    };
    console.log('🪑 [handleTakeSeat] Sending message:', message);
    sendMessage(message);
    
    setIsSeatsModalOpen(false);
    toast.success(`Moved to seat ${seatId}`);
  };
  
  // Handle seat swap request
  const handleSeatSwapRequest = (targetUserId, targetSeatId) => {
    console.log('🪑 [handleSeatSwapRequest] Called:', { targetUserId, targetSeatId, currentUserId: currentUser?.id });
    sendSwapRequest(targetUserId, targetSeatId);
    console.log('🪑 [handleSeatSwapRequest] sendSwapRequest called');
  };
  
  // Handle avatar click
  const handleAvatarClick = async (memberData) => {
    if (!memberData || memberData.id === currentUser?.id) return;
    
    // Enrich memberData with full user info from watchSessionMembers
    const fullMemberData = watchSessionMembers.find(m => m.id === memberData.id) || memberData;
    
    setProfileModalUser(fullMemberData);
    setIsProfileModalOpen(true);
    
    // Fetch friendship status
    try {
      const response = await getFriendshipStatus(memberData.id);
      setFriendshipStatus(response.data.status);
      setIsRequester(response.data.is_requester || false);
    } catch (err) {
      console.error('Failed to fetch friendship status:', err);
      setFriendshipStatus('none');
      setIsRequester(false);
    }
  };
  
  // Handle friend request send/cancel
  const handleFriendRequest = async () => {
    if (!profileModalUser) return;
    
    try {
      if (friendshipStatus === 'pending' && isRequester) {
        // Cancel friend request
        toast('Cancel request feature coming soon', { icon: 'ℹ️' });
      } else {
        // Send friend request
        await sendFriendRequest(profileModalUser.id);
        setFriendshipStatus('pending');
        setIsRequester(true);
        toast.success(`Friend request sent to ${profileModalUser.username}`);
      }
    } catch (err) {
      console.error('Friend request error:', err);
      toast.error(err.response?.data?.error || 'Failed to send friend request');
    }
  };
  
  // Handle members click
  const handleMembersClick = () => {
    console.log('👥 [handleMembersClick] Opening members modal with:', {
      watchSessionMembers,
      membersCount: watchSessionMembers.length,
      userSeats,
      userSeatsCount: Object.keys(userSeats).length
    });
    setIsMembersModalOpen(true);
  };
  
  // Handle chat open
  const handleOpenChat = () => {
    setShowChatHome(true);
  };
  
  // Handle quiz click
  const handleQuizClick = () => {
    setIsQuizManagementOpen(true);
  };
  
  // Handle take quiz (for students)
  const handleTakeQuiz = (quiz) => {
    // If no quiz is passed, try to use activeQuiz (backward compatibility)
    const targetQuiz = quiz || activeQuiz;
    
    if (!targetQuiz) {
      toast.error('No active quiz available');
      return;
    }
    
    const quizId = targetQuiz.quiz_id || targetQuiz.id;
    
    // Check if already submitted THIS specific quiz
    const hasSubmitted = quizHistory?.completed_submissions?.some(sub => sub.quiz_id === quizId);
    if (hasSubmitted) {
      toast("You've already submitted this quiz");
      return;
    }
    
    // Request quiz data from backend (without correct answers)
    sendMessage({
      type: 'quiz_request',
      data: { quiz_id: quizId }
    });
    
    console.log('📝 [PositionCalculator] Requesting quiz data:', quizId);
  };
  
  // Handle create quiz
  const handleCreateQuiz = () => {
    // Validate room and session IDs before opening quiz modal
    if (!actualRoomId) {
      console.error('❌ [PositionCalculator] Cannot create quiz: roomId is missing');
      alert('Cannot create quiz: Room ID is missing. Please access this page from a valid lecture hall session.');
      return;
    }
    if (!actualSessionId) {
      console.error('❌ [PositionCalculator] Cannot create quiz: sessionId is missing');
      alert('Cannot create quiz: Session ID is missing. Please access this page from a valid lecture hall session.');
      return;
    }
    console.log('✅ [PositionCalculator] Creating quiz with roomId:', actualRoomId, 'sessionId:', actualSessionId);
    setIsQuizManagementOpen(false);
    setIsMakeQuizOpen(true);
  };
  
  // Handle view quiz results
  const handleViewResults = (quizId) => {
    console.log('📊 View results for quiz:', quizId);
    // TODO: Implement results view
  };
  
  // Handle media selection for blackboard
  const handleMediaSelect = (media) => {
    console.log('🎬 [PositionCalculator] handleMediaSelect called with:', media);
    console.log('🎬 [PositionCalculator] media.file_path:', media?.file_path);
    console.log('🎬 [PositionCalculator] All media properties:', Object.keys(media || {}));
    
    if (media) {
      let fileUrl = media.file_path || media.file_url || media.FileURL || media.FilePath;
      
      // Ensure the URL is absolute (points to backend server)
      if (fileUrl && !fileUrl.startsWith('http')) {
        fileUrl = `http://localhost:8080/${fileUrl}`;
      }
      
      const mediaState = {
        file_url: fileUrl,
        url: fileUrl,
        mediaUrl: fileUrl, // ✅ Cinema expects this property
        type: media.mime_type || media.media_type || media.MediaType || 'video/mp4',
        title: media.original_name || media.OriginalName || media.title || 'Media',
        timestamp: 0,
        playing: true
      };
      console.log('🎬 [PositionCalculator] Setting blackboardMedia immediately:', mediaState);
      setBlackboardMedia(mediaState);
      
      // ✅ Update session media state in backend for preview generation
      if (sendMessage && actualSessionId) {
        sendMessage({
          type: 'update_media_state',
          data: {
            session_id: actualSessionId,
            current_media_url: fileUrl,
            current_media_type: 'upload',
            is_screen_sharing_active: false,
            sharing_source: null
          }
        });
        console.log('📡 [Media State] Sent update_media_state for upload:', fileUrl);
        
        // ✅ Send media_play event to trigger preview generation for uploaded media
        sendMessage({
          type: 'media_play',
          data: {
            session_id: actualSessionId,
            media_id: media.id || media.ID,
            url: fileUrl,
            type: media.mime_type || media.media_type || 'video/mp4',
            title: media.original_name || media.OriginalName || 'Media',
            is_temporary: media.SessionID ? true : false // Has SessionID = temporary
          }
        });
        console.log('📡 [Media Play] Sent media_play event for preview generation:', {
          media_id: media.id || media.ID,
          url: fileUrl,
          is_temporary: media.SessionID ? true : false
        });
      }
    } else {
      console.error('❌ [PositionCalculator] No media object provided!');
    }
  };
  
  // Handle LiveShare (screen/camera share to blackboard)
  const handleStartScreenShare = async (mode, source = 'liveshare') => {
    console.log('🎥 [LiveShare] Starting screen share with mode:', mode, 'source:', source);
    
    if (!livekitRoom) {
      console.error('❌ [LiveShare] LiveKit room not available');
      toast.error('Unable to start LiveShare - room not connected');
      return;
    }
    
    // 💾 Save current blackboard state before starting LiveShare
    console.log('💾 [LiveShare] Saving previous blackboard state:', blackboardMedia);
    previousBlackboardStateRef.current = blackboardMedia;
    
    try {
      let screenStream = null;
      let cameraStream = null;
      
      // Get screen share if needed
      if (mode === 'screen' || mode === 'both') {
        // Enable screen share with high-quality settings (NO SIMULCAST - single quality only)
        await livekitRoom.localParticipant.setScreenShareEnabled(true, {
          // High quality for screen content and videos
          resolution: {
            width: 1920,
            height: 1080,
            frameRate: 30 // 30fps for smooth video playback
          },
          // ⚠️ SIMULCAST DISABLED - send ONLY highest quality, no adaptive switching
          simulcast: false,
          // Higher bitrate for crisp text/code
          videoBitrate: 3000000 // 3 Mbps
        });
        
        console.log('🎬 [LiveShare] Screen share enabled - HIGH QUALITY ONLY (simulcast disabled)');
        
        // Get screen track publication (LiveKit publishes it automatically)
        const screenTrackPub = livekitRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (screenTrackPub && screenTrackPub.track) {
          screenStream = new MediaStream([screenTrackPub.track.mediaStreamTrack]);
          screenShareTrackRef.current = screenTrackPub.track;
          setScreenShareTrackSid(screenTrackPub.trackSid);
          console.log('✅ [LiveShare] Screen share track acquired, trackSid:', screenTrackPub.trackSid);
        } else {
          throw new Error('Screen share track not available');
        }
      }
      
      // Get camera share if needed
      if (mode === 'camera' || mode === 'both') {
        // ✅ CLEANUP: Stop any existing camera tracks before starting new one
        if (cameraShareTrackRef.current) {
          console.log('🧹 [LiveShare] Cleaning up existing camera track before starting new one');
          try {
            if (livekitRoom) {
              await livekitRoom.localParticipant.unpublishTrack(cameraShareTrackRef.current);
            }
            cameraShareTrackRef.current.stop();
          } catch (cleanupErr) {
            console.warn('⚠️ [LiveShare] Existing camera cleanup warning:', cleanupErr);
          }
          cameraShareTrackRef.current = null;
          
          // ✅ Add delay to ensure browser fully releases camera resource
          console.log('⏳ [LiveShare] Waiting 500ms for camera resource release...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 🔍 Diagnostic: Check browser permissions state
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' });
          console.log('🔐 [LiveShare] Camera permission state:', permissionStatus.state);
        } catch (permErr) {
          console.warn('⚠️ [LiveShare] Could not query camera permission:', permErr.message);
        }
        
        // 🔍 Diagnostic: Check for active media tracks in the page
        const activeTracks = [];
        document.querySelectorAll('video, audio').forEach((el, idx) => {
          if (el.srcObject && el.srcObject instanceof MediaStream) {
            el.srcObject.getTracks().forEach(track => {
              activeTracks.push({
                element: `${el.tagName}[${idx}]`,
                kind: track.kind,
                label: track.label,
                readyState: track.readyState,
                enabled: track.enabled,
                id: track.id.substring(0, 20)
              });
            });
          }
        });
        console.log('📹 [LiveShare] Active media tracks in page:', activeTracks.length);
        if (activeTracks.length > 0) {
          console.table(activeTracks);
        }
        
        // 🔍 Diagnostic: Check LiveKit published tracks
        if (livekitRoom?.localParticipant) {
          const publishedTracks = Array.from(livekitRoom.localParticipant.trackPublications.values());
          console.log('📡 [LiveShare] LiveKit published tracks:', publishedTracks.length);
          publishedTracks.forEach(pub => {
            console.log(`  - ${pub.source}: ${pub.trackSid} (${pub.track?.mediaStreamTrack?.readyState || 'no track'})`);
          });
        }
        
        const cameraDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = cameraDevices.filter(d => d.kind === 'videoinput');
        
        console.log('🎥 [LiveShare] Video devices detected:', videoDevices.length);
        videoDevices.forEach((device, idx) => {
          console.log(`  ${idx + 1}. ${device.label || 'Unnamed'} (${device.deviceId.substring(0, 20)}...)`);
        });
        
        if (videoDevices.length === 0) {
          toast.error('No camera devices found');
          if (mode === 'camera') return;
        } else {
          // ✅ TRY EACH CAMERA INDIVIDUALLY - some may be blocked while others work
          let stream = null;
          let cameraSuccess = false;
          
          // 🎯 Strategy: Try each available camera device one by one
          for (let deviceIndex = 0; deviceIndex < videoDevices.length && !cameraSuccess; deviceIndex++) {
            const device = videoDevices[deviceIndex];
            console.log(`\n🎯 [LiveShare] Trying camera ${deviceIndex + 1}/${videoDevices.length}: ${device.label || 'Unnamed'}`);
            console.log(`   Device ID: ${device.deviceId.substring(0, 30)}...`);
            
            const deviceConstraints = {
              video: {
                deviceId: { exact: device.deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
              },
              audio: false
            };
            
            // Try this specific device 2 times before moving to next device
            let deviceAttempt = 0;
            const maxAttemptsPerDevice = 2;
            
            while (deviceAttempt < maxAttemptsPerDevice && !cameraSuccess) {
              deviceAttempt++;
              
              try {
                console.log(`📹 [LiveShare] Requesting ${device.label || 'Unnamed'} (1080p) - Attempt ${deviceAttempt}/${maxAttemptsPerDevice}`);
                console.log('🎬 [LiveShare] Constraints:', JSON.stringify(deviceConstraints, null, 2));
                
                console.log('⏱️ [LiveShare] Calling getUserMedia at:', new Date().toISOString());
                stream = await navigator.mediaDevices.getUserMedia(deviceConstraints);
                console.log('✅ [LiveShare] getUserMedia returned at:', new Date().toISOString());
              
              const videoTrack = stream.getVideoTracks()[0];
              const settings = videoTrack.getSettings();
              console.log('✅ [LiveShare] Camera stream acquired:', {
                resolution: `${settings.width}x${settings.height}`,
                frameRate: settings.frameRate,
                deviceId: settings.deviceId?.substring(0, 20),
                label: videoTrack.label
              });
              
              // Create LiveKit LocalVideoTrack
              const localVideoTrack = new LocalVideoTrack(videoTrack);
              
              // Publish the camera track to LiveKit
              const cameraPublication = await livekitRoom.localParticipant.publishTrack(localVideoTrack, {
                source: Track.Source.Camera,
                name: 'camera-share',
                simulcast: false,
                videoEncoding: {
                  maxBitrate: 4000000, // 4 Mbps for Full HD 1080p
                  maxFramerate: 30
                }
              });
              
              console.log('✅ [LiveShare] Camera track published - HIGH QUALITY:', {
                trackSid: cameraPublication.trackSid,
                source: cameraPublication.source,
                kind: cameraPublication.kind
              });
              
              setCameraShareTrackSid(cameraPublication.trackSid);
              cameraStream = new MediaStream([localVideoTrack.mediaStreamTrack]);
              cameraShareTrackRef.current = localVideoTrack;
              cameraSuccess = true; // ✅ Success - exit all loops
              
              console.log(`\n✅✅✅ [LiveShare] SUCCESS with ${device.label || 'Unnamed'} camera!\n`);
              
            } catch (err) {
              console.error(`❌ [LiveShare] ${device.label || 'Unnamed'} failed (attempt ${deviceAttempt}/${maxAttemptsPerDevice}):`, {
                name: err.name,
                message: err.message,
                constraint: err.constraint,
                stack: err.stack?.split('\n').slice(0, 3).join('\n')
              });
              
              // 🔍 Re-check devices after failure to see if anything changed
              try {
                const devicesAfterFail = await navigator.mediaDevices.enumerateDevices();
                const videoAfterFail = devicesAfterFail.filter(d => d.kind === 'videoinput');
                console.log('📹 [LiveShare] Devices still available after failure:', videoAfterFail.length);
                
                // Check if device labels are still readable (indicates permission granted)
                const hasLabels = videoAfterFail.some(d => d.label && d.label !== '');
                console.log('🏷️ [LiveShare] Device labels readable:', hasLabels ? 'YES (permissions granted)' : 'NO (permissions denied or device busy)');
              } catch (enumErr) {
                console.warn('⚠️ [LiveShare] Could not enumerate devices after failure:', enumErr.message);
              }
              
              const isResourceError = err.name === 'NotReadableError' || err.name === 'AbortError';
              
              if (deviceAttempt < maxAttemptsPerDevice && isResourceError) {
                const waitTime = 500; // Short 500ms wait between retries on same device
                console.log(`⏳ [LiveShare] Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              } else if (deviceAttempt >= maxAttemptsPerDevice) {
                if (deviceIndex < videoDevices.length - 1) {
                  console.log(`⏭️ [LiveShare] ${device.label || 'Unnamed'} unavailable, trying next camera...\n`);
                } else {
                  console.log(`\n❌❌❌ [LiveShare] ALL cameras failed. Checked ${videoDevices.length} device(s).\n`);
                  toast.error(isResourceError 
                    ? 'All cameras are in use. Please close OBS, Zoom, Teams, or other apps using the camera.' 
                    : 'Failed to access any camera.');
                  if (mode === 'camera') return;
                }
                break; // Exit retry loop for this device, move to next
              }
            }
          } // End retry loop for this device
        } // End loop through all devices
        
        // Final check if camera was acquired
        if (!cameraSuccess) {
          console.log('⚠️ [LiveShare] Proceeding without camera after exhausting all options');
        }
        } // End else block (videoDevices.length > 0)
      }
      
      // Set blackboard media with streams
      const mediaState = {
        type: 'liveshare',
        stream: screenStream,
        cameraStream: cameraStream,
        playing: true
      };
      
      console.log('🎬 [LiveShare] Setting blackboardMedia with streams:', {
        hasScreen: !!screenStream,
        hasCamera: !!cameraStream,
        mode
      });
      
      setBlackboardMedia(mediaState);
      setIsScreenSharingActive(true);
      setLiveShareMode(mode);
      setSharingSource(source); // Track whether it's 'liveshare' or 'watchfrom'
      toast.success(source === 'watchfrom' ? 'Watch From started' : 'LiveShare started');
      
      // ✅ Update session media state in backend for preview generation
      if (sendMessage && actualSessionId) {
        sendMessage({
          type: 'update_media_state',
          data: {
            session_id: actualSessionId,
            current_media_url: null,
            current_media_type: source, // 'liveshare' or 'watchfrom'
            is_screen_sharing_active: true,
            sharing_source: source
          }
        });
        console.log('📡 [Media State] Sent update_media_state for screen share:', source);
      }
      
      // Notify other participants via WebSocket with track SIDs for instant subscription
      if (sendMessage) {
        // Give tracks a moment to fully propagate before sending message
        setTimeout(() => {
          const message = {
            type: 'liveshare_started',
            data: {
              user_id: currentUser?.id,
              mode: mode
            }
          };
          
          // Include track SIDs if available (allows members to directly subscribe)
          const screenPub = livekitRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
          const cameraPub = Array.from(livekitRoom.localParticipant.trackPublications.values())
            .find(pub => pub.source === Track.Source.Camera);
          
          if (screenPub?.trackSid) {
            message.data.screen_track_sid = screenPub.trackSid;
            console.log('📤 [LiveShare] Including screen trackSid:', screenPub.trackSid);
          }
          if (cameraPub?.trackSid) {
            message.data.camera_track_sid = cameraPub.trackSid;
            console.log('📤 [LiveShare] Including camera trackSid:', cameraPub.trackSid);
          }
          
          sendMessage(message);
        }, 500); // 500ms delay to ensure tracks are published
      }
      
    } catch (error) {
      console.error('❌ [LiveShare] Failed to start:', error);
      toast.error('Failed to start LiveShare');
      
      // Cleanup on error
      if (livekitRoom) {
        await livekitRoom.localParticipant.setScreenShareEnabled(false);
        
        // Cleanup camera track if it was published
        if (cameraShareTrackRef.current) {
          try {
            await livekitRoom.localParticipant.unpublishTrack(cameraShareTrackRef.current);
            cameraShareTrackRef.current.stop();
          } catch (cleanupErr) {
            console.error('❌ [LiveShare] Camera cleanup error:', cleanupErr);
          }
          cameraShareTrackRef.current = null;
        }
      }
    }
  };
  
  const handleEndScreenShare = async () => {
    const source = sharingSource || 'liveshare';
    console.log('🎥 [Screen Share] Ending screen share, source:', source);
    
    try {
      // Stop LiveKit screen share
      if (livekitRoom && screenShareTrackRef.current) {
        await livekitRoom.localParticipant.setScreenShareEnabled(false);
        screenShareTrackRef.current = null;
      }
      
      // Stop camera track (unpublish from LiveKit)
      if (livekitRoom && cameraShareTrackRef.current) {
        await livekitRoom.localParticipant.unpublishTrack(cameraShareTrackRef.current);
        cameraShareTrackRef.current.stop();
        cameraShareTrackRef.current = null;
      }
      
      // 🔄 Restore previous blackboard state (or clear to white)
      console.log('🔄 [LiveShare] Restoring previous blackboard state:', previousBlackboardStateRef.current);
      setBlackboardMedia(previousBlackboardStateRef.current);
      previousBlackboardStateRef.current = null; // Clear saved state
      
      setIsScreenSharingActive(false);
      setLiveShareMode(null);
      setSharingSource(null); // Clear source
      setScreenShareTrackSid(null);
      setCameraShareTrackSid(null);
      toast.success(source === 'watchfrom' ? 'Watch From ended' : 'LiveShare ended');
      
      // ✅ Update session media state in backend to restore previous or clear
      if (sendMessage && actualSessionId) {
        const previousMedia = previousBlackboardStateRef.current;
        sendMessage({
          type: 'update_media_state',
          data: {
            session_id: actualSessionId,
            current_media_url: previousMedia?.file_url || null,
            current_media_type: previousMedia?.type === 'upload' ? 'upload' : null,
            is_screen_sharing_active: false,
            sharing_source: null
          }
        });
        console.log('📡 [Media State] Sent update_media_state to clear screen share');
      }
      
      // Notify other participants
      if (sendMessage) {
        const endMessage = {
          type: 'liveshare_ended',
          data: {
            user_id: currentUser?.id
          }
        };
        console.log('📤 [LiveShare] Sending liveshare_ended message to all participants:', endMessage);
        sendMessage(endMessage);
        console.log('✅ [LiveShare] liveshare_ended message sent');
      } else {
        console.warn('⚠️ [LiveShare] sendMessage not available - cannot notify participants');
      }
      
    } catch (error) {
      console.error('❌ [Screen Share] Failed to end:', error);
      toast.error('Failed to end screen share');
    }
  };
  
  const handleRemoveCamera = () => {
    console.log('📹 [LiveShare] Removing camera overlay');
    
    // Stop camera stream
    if (cameraShareTrackRef.current) {
      cameraShareTrackRef.current.getTracks().forEach(track => track.stop());
      cameraShareTrackRef.current = null;
    }
    
    // Update media to remove camera stream
    if (blackboardMedia) {
      setBlackboardMedia({
        ...blackboardMedia,
        cameraStream: null
      });
    }
    
    // Update mode
    if (liveShareMode === 'both') {
      setLiveShareMode('screen');
    } else if (liveShareMode === 'camera') {
      // If only camera was active, end entire LiveShare
      handleEndScreenShare();
    }
    
    toast.success('Camera removed');
  };
  
  // Handle exit/leave session
  const handleExit = async () => {
    console.log('🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY =====');
    console.log('🚨 [handleExit] disconnect exists?', !!disconnect, typeof disconnect);
    console.log('🚨 [handleExit] sendMessage exists?', !!sendMessage, typeof sendMessage);
    console.log('🚨 [handleExit] currentUser:', currentUser?.id);
    console.log('🚨 [handleExit] isHost:', isHost);
    
    const confirmExit = window.confirm(
      isHost 
        ? 'End this watch session for everyone? All participants will be returned to the room lobby.'
        : 'Leave lecture hall?'
    );
    
    if (!confirmExit) {
      console.log('🚨 [handleExit] EXIT CANCELLED by user');
      return;
    }
    
    console.log('🚨 [handleExit] EXIT CONFIRMED, proceeding...');
    
    try {
      console.log('🚪 [handleExit] STARTED - Current state:', {
        isHost,
        currentURL: window.location.href,
        sessionId: finalSessionId,
        actualSessionId,
        userId: currentUser?.id
      });
      
      // If host, end the session for everyone
      if (isHost && finalSessionId) {
        console.log('🔴 [PositionCalculatorPage] Host ending session:', finalSessionId);
        await endWatchSession(roomId, finalSessionId);
        console.log('✅ [PositionCalculatorPage] Session ended successfully');
        toast.success('Watch session ended');
      } else {
        // If participant, send leave message and wait for backend acknowledgment
        if (sendMessage && currentUser && waitForAcknowledgment) {
          console.log('👋 [PositionCalculatorPage] Participant leaving - sending leave_session message');
          console.log('🚨 [BEFORE sendMessage] About to send leave_session');
          
          // Send leave message
          sendMessage({
            type: 'leave_session',
            user_id: currentUser.id
          });
          console.log('🚨 [AFTER sendMessage] Message sent, waiting for acknowledgment...');
          
          // ✅ EVENT-DRIVEN: Wait for backend to acknowledge the leave was processed
          console.log('⏳ [PositionCalculatorPage] Waiting for leave_acknowledged from backend...');
          await waitForAcknowledgment('leave_session', 2000); // 2s timeout
          console.log('✅ [PositionCalculatorPage] Leave acknowledged by backend (or timeout)');
        } else {
          console.log('🚨 [handleExit] SKIPPING leave message - sendMessage:', !!sendMessage, 'currentUser:', !!currentUser, 'waitForAcknowledgment:', !!waitForAcknowledgment);
        }
      }
      
      // ✅ Gracefully close WebSocket connection before navigation
      console.log('🚨🚨🚨 [handleExit] ABOUT TO CALL disconnect() - exists?', !!disconnect);
      if (disconnect) {
        console.log('🔌 [PositionCalculatorPage] Disconnecting WebSocket gracefully...');
        console.log('🚨 [BEFORE disconnect()] Calling disconnect now...');
        await disconnect();
        console.log('🚨 [AFTER disconnect()] disconnect() returned');
        console.log('✅ [PositionCalculatorPage] WebSocket disconnected');
      } else {
        console.log('🚨🚨🚨 [handleExit] disconnect is UNDEFINED or FALSE!');
      }

      // ✅ QUIZ CLEANUP: Clear all quiz-related state and storage
      console.log('🧹 [handleExit] Cleaning up quiz state...');
      
      // Clear sessionStorage quiz keys
      sessionStorage.removeItem(STORAGE_KEYS.QUIZZES);
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_QUIZ);
      sessionStorage.removeItem(STORAGE_KEYS.QUIZ_RESULTS);
      sessionStorage.removeItem(STORAGE_KEYS.QUIZ_PROGRESS);
      sessionStorage.removeItem(STORAGE_KEYS.QUIZ_HISTORY);
      
      // Clear localStorage quiz answer drafts (quiz_answers_*)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('quiz_answers_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Reset quiz state variables
      setQuizzes([]);
      setActiveQuiz(null);
      setQuizResults(null);
      setQuizProgress(null);
      setQuizHistory({ active_quizzes: [], completed_submissions: [] });
      
      console.log('✅ [handleExit] Quiz state cleared:', {
        sessionStorageCleared: ['QUIZZES', 'ACTIVE_QUIZ', 'QUIZ_RESULTS', 'QUIZ_PROGRESS', 'QUIZ_HISTORY'],
        localStorageCleared: keysToRemove.length,
        stateReset: true
      });
      
      console.log('🚨 [handleExit] About to navigate...');

      
      // Navigate back - lobby for instant watch, room page for persistent rooms
      const navUrl = isInstantWatch ? '/lobby' : `/rooms/${roomId}`;
      console.log('🧭 [PositionCalculatorPage] Navigating to:', navUrl, '(instant watch:', isInstantWatch, ')');
      console.log('🧭 [PositionCalculatorPage] Current URL BEFORE navigation:', window.location.href);
      console.log('🧭 [PositionCalculatorPage] About to call navigate() - component should unmount after this');
      
      navigate(navUrl);
      
      // Log after navigation (may not execute if component unmounts)
      console.log('✅ [PositionCalculatorPage] Navigation command issued - this may not log if unmounting');
      console.log('✅ [PositionCalculatorPage] If you see this, component is still mounted after navigate()');
    } catch (error) {
      console.error('❌ [PositionCalculatorPage] Failed to leave/end session:', error);
      toast.error('Failed to leave session. Please try again.');
    }
  };
  
  // Export saved camera positions
  const handleExportCameraPositions = () => {
    const exportData = JSON.stringify(savedCameraPositions, null, 2);
    console.log('📦 Saved Camera Positions:', exportData);
    
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lecture_hall_camera_positions.json';
    a.click();
    
    alert(`Exported ${Object.keys(savedCameraPositions).length} camera positions!`);
  };
  
  // Switch camera view direction (left/center/right) for selected seat
  const switchViewDirection = (direction) => {
    // ✅ Use hostViewSeat for host, selectedSeatId for students
    const effectiveSeatId = isHost ? hostViewSeat : selectedSeatId;
    
    if (!effectiveSeatId || !controlsRef.current) {
      console.warn('Cannot switch view: No seat selected or controls not ready');
      return;
    }

    const camera = controlsRef.current.object;
    const seatData = savedCameraPositions[String(effectiveSeatId)];
    if (!seatData) {
      console.warn(`No camera data for seat ${effectiveSeatId}`);
      return;
    }

    // Get camera position (same for all views)
    const cameraPos = seatData.position;

    // Get lookingAt based on direction
    let lookingAtPos;
    if (direction === 'left') {
      const leftRightData = lectureHallLeftRightViews[String(effectiveSeatId)];
      if (!leftRightData?.left) {
        console.warn(`No left view data for seat ${effectiveSeatId}`);
        return;
      }
      lookingAtPos = leftRightData.left;
    } else if (direction === 'right') {
      const leftRightData = lectureHallLeftRightViews[String(effectiveSeatId)];
      if (!leftRightData?.right) {
        console.warn(`No right view data for seat ${effectiveSeatId}`);
        return;
      }
      lookingAtPos = leftRightData.right;
    } else {
      // center
      lookingAtPos = seatData.lookingAt;
    }

    // Temporarily unlock controls to apply position
    const wasEnabled = controlsRef.current.enabled;
    const wasPanEnabled = controlsRef.current.enablePan;
    const wasRotateEnabled = controlsRef.current.enableRotate;
    const wasZoomEnabled = controlsRef.current.enableZoom;
    
    controlsRef.current.enabled = true;
    controlsRef.current.enablePan = true;
    controlsRef.current.enableRotate = true;
    controlsRef.current.enableZoom = true;

    // Set target (lookingAt) and camera position
    controlsRef.current.target.set(
      lookingAtPos.x,
      lookingAtPos.y,
      lookingAtPos.z
    );
    
    camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
    
    // Force update to sync controls
    controlsRef.current.update();

    // Restore controls state
    controlsRef.current.enabled = wasEnabled;
    controlsRef.current.enablePan = wasPanEnabled;
    controlsRef.current.enableRotate = wasRotateEnabled;
    controlsRef.current.enableZoom = wasZoomEnabled;

    setCurrentViewDirection(direction);
    console.log(`👁️ [${isHost ? 'Host' : 'Student'}] Switched to ${direction.toUpperCase()} view for seat ${effectiveSeatId}`);
  };
  
  // 🔄 Toggle host view between seat 145 (students) and seat 146 (board)
  const handleTurnaround = () => {
    if (!isHost) return;
    
    const newSeat = hostViewSeat === 145 ? 146 : 145;
    setHostViewSeat(newSeat);
    
    // Manually switch to the new seat with current view direction
    if (!controlsRef.current) return;
    
    const camera = controlsRef.current.object;
    const seatData = savedCameraPositions[String(newSeat)];
    if (!seatData) {
      console.warn(`No camera data for seat ${newSeat}`);
      return;
    }

    const cameraPos = seatData.position;
    let lookingAtPos;
    
    if (currentViewDirection === 'left') {
      const leftRightData = lectureHallLeftRightViews[String(newSeat)];
      lookingAtPos = leftRightData?.left || seatData.lookingAt;
    } else if (currentViewDirection === 'right') {
      const leftRightData = lectureHallLeftRightViews[String(newSeat)];
      lookingAtPos = leftRightData?.right || seatData.lookingAt;
    } else {
      lookingAtPos = seatData.lookingAt;
    }

    // Temporarily unlock controls
    const wasEnabled = controlsRef.current.enabled;
    const wasPanEnabled = controlsRef.current.enablePan;
    const wasRotateEnabled = controlsRef.current.enableRotate;
    const wasZoomEnabled = controlsRef.current.enableZoom;
    
    controlsRef.current.enabled = true;
    controlsRef.current.enablePan = true;
    controlsRef.current.enableRotate = true;
    controlsRef.current.enableZoom = true;

    controlsRef.current.target.set(lookingAtPos.x, lookingAtPos.y, lookingAtPos.z);
    camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
    controlsRef.current.update();

    // Restore controls
    controlsRef.current.enabled = wasEnabled;
    controlsRef.current.enablePan = wasPanEnabled;
    controlsRef.current.enableRotate = wasRotateEnabled;
    controlsRef.current.enableZoom = wasZoomEnabled;
    
    const label = newSeat === 146 ? 'Board' : 'Students';
    console.log(`🔄 [Host Turnaround] Switched to seat ${newSeat} (${label}) with ${currentViewDirection.toUpperCase()} view`);
    toast.success(`Now viewing: ${label}`);
  };
  
  // 🔄 Cycle to previous seat
  const handlePrevSeat = () => {
    if (previewSeats.length === 0) return;
    
    const newIndex = currentSeatIndex > 0 ? currentSeatIndex - 1 : previewSeats.length - 1;
    setCurrentSeatIndex(newIndex);
    
    const newSeat = previewSeats[newIndex];
    if (newSeat) {
      setSelectedSeatId(newSeat.id);
      snapCameraToSeat(newSeat);
      setModalSeatNumber(newSeat.id);
      console.log(`⬅️ Prev seat: ${newSeat.id}`);
    }
  };
  
  // 🔄 Cycle to next seat
  const handleNextSeatCycle = () => {
    if (previewSeats.length === 0) return;
    
    const newIndex = currentSeatIndex < previewSeats.length - 1 ? currentSeatIndex + 1 : 0;
    setCurrentSeatIndex(newIndex);
    
    const newSeat = previewSeats[newIndex];
    if (newSeat) {
      setSelectedSeatId(newSeat.id);
      snapCameraToSeat(newSeat);
      setModalSeatNumber(newSeat.id);
      console.log(`➡️ Next seat: ${newSeat.id}`);
    }
  };
  
  // ⭐ Toggle mark for current seat
  const toggleMarkSeat = () => {
    if (!selectedSeatId) return;
    
    setMarkedSeats(prev => {
      if (prev.includes(selectedSeatId)) {
        console.log(`❌ Unmarked seat ${selectedSeatId}`);
        return prev.filter(id => id !== selectedSeatId);
      } else {
        console.log(`⭐ Marked seat ${selectedSeatId}`);
        return [...prev, selectedSeatId].sort((a, b) => a - b);
      }
    });
  };
  
  // 📥 Export marked seats to JSON file
  const exportMarkedSeats = () => {
    if (markedSeats.length === 0) {
      toast.error('No seats marked for export');
      return;
    }
    
    const exportData = {
      markedSeats: markedSeats,
      count: markedSeats.length,
      timestamp: new Date().toISOString(),
      notes: 'Seats marked for avatar occlusion review'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marked_seats_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Exported ${markedSeats.length} marked seats`);
    console.log('📥 Exported marked seats:', markedSeats);
  };
  
  // 🗑️ Clear all marked seats
  const clearMarkedSeats = () => {
    setMarkedSeats([]);
    toast.success('Cleared all marked seats');
    console.log('🗑️ Cleared all marked seats');
  };
  
  // Calculate initial camera position based on role and seat assignment
  const getInitialCameraPosition = () => {
    if (isHost) {
      // Host starts at seat 145 (teacher position)
      const hostCamPos = lectureHallCameraPositions['145'];
      if (hostCamPos) {
        return [hostCamPos.position.x, hostCamPos.position.y, hostCamPos.position.z];
      }
      return [2.694838175725354, 25.138714044001794, -234.1996666700323]; // Fallback
    } else {
      // Students: Find first available seat and use its camera position
      const takenSeats = Object.values(userSeats);
      let nextSeatId = 1;
      while (takenSeats.includes(nextSeatId) && nextSeatId <= 144) {
        nextSeatId++;
      }
      
      if (nextSeatId <= 144) {
        const studentCamPos = lectureHallCameraPositions[String(nextSeatId)];
        if (studentCamPos) {
          // Camera positioned for seat
          return [studentCamPos.position.x, studentCamPos.position.y, studentCamPos.position.z];
        }
      }
      
      // Fallback: overview position if no seats available or no camera data
      return [0, 5, 10];
    }
  };
  
  const initialCameraPosition = getInitialCameraPosition();
  
  return (
    <div className="h-screen bg-gray-900 text-white flex overflow-hidden">
      {/* 3D Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <Canvas
          camera={{ position: initialCameraPosition, fov: 50 }}
          onCreated={({ gl }) => {
            gl.setClearColor('#1a1a1a');
          }}
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <pointLight position={[-10, -10, -5]} intensity={0.5} />
          
          <Model 
            modelType={modelType} 
            onModelClick={handleModelClick} 
            onModelLoaded={handleModelLoaded}
            visibleMarkers={visibleMarkers}
          />
          
          {/* Blackboard - always visible for lecture hall */}
          <>
            {/* Blackboard - 126 wide × 66 tall */}
            <BlackboardWithMedia 
              position={[-0.933, 66.352, -235]} 
              dimensions={[126, 68, 0.5]}
              media={blackboardMedia}
              onClose={() => setBlackboardMedia(null)}
              isHost={isHost}
              sendMessage={sendMessage}
              videoElementRef={sharedVideoRef}
              cameraVideoElementRef={cameraVideoRef}
              onTimeUpdate={handleBoardVideoTimeUpdate}
              onRemoveCamera={handleRemoveCamera}
              liveShareMode={liveShareMode}
              onFullscreenRequest={() => setIsMediaFullscreen(true)}
              pendingSeekTime={pendingSeekTime}
              setPendingSeekTime={setPendingSeekTime}
              loadStartTimeRef={loadStartTimeRef}
            />
          </>
          
          {/* Camera position markers for generated seats */}
          {showCameraMarkers && previewSeats.length > 0 && (
            <>
              {previewSeats.map((seat) => {
                if (seat.id <= 5) {
                  console.log(`📍 Marker ${seat.id} position:`, seat.position);
                }
                return (
                  <mesh key={`cam-${seat.id}`} position={seat.position}>
                    <boxGeometry args={[seat.isHost ? 1.5 : 0.8, seat.isHost ? 1.5 : 0.8, seat.isHost ? 1.5 : 0.8]} />
                    <meshStandardMaterial 
                      color={seat.isHost ? '#ff00ff' : '#00ffff'} 
                      emissive={seat.isHost ? '#ff00ff' : '#00ffff'}
                      emissiveIntensity={0.7}
                      wireframe={true}
                      transparent={true}
                      opacity={0.6}
                    />
                  </mesh>
                );
              })}
            </>
          )}
          
          {/* User Avatars - SEAT-BASED: Shows avatars for occupied seats */}
          {/* Debug logging for avatar troubleshooting */}
          <LectureHallAvatarManager
            previewSeats={previewSeats}
            showAvatars={showAvatars}
            userSeats={userSeats}
            userIdToUsername={userIdToUsername}
            currentUserId={currentUser?.id}
            onAvatarClick={handleAvatarClick}
            remoteAudioStates={remoteAudioStates}
          />
          
          {(() => {
            // ✅ Only host and super_admin can move camera (pan/zoom/rotate)
            const isPrivilegedUser = isHost || currentUser?.role === 'super_admin';
            
            return (
              <OrbitControls 
                ref={controlsRef}
                enabled={true}
                enablePan={isPrivilegedUser ? (freeRoamMode ? true : !lockMovement) : false}
                enableZoom={isPrivilegedUser ? (freeRoamMode ? true : !lockMovement) : false}
                enableRotate={isPrivilegedUser ? (freeRoamMode ? true : !lockOrbit) : false}
                minDistance={1}
                maxDistance={freeRoamMode ? 500 : (lockMovement ? 50 : 500)}
                // When Free Roam is OFF: lock vertical rotation, allow horizontal (left/right)
                minPolarAngle={freeRoamMode ? 0 : Math.PI / 2}
                maxPolarAngle={freeRoamMode ? Math.PI : Math.PI / 2}
              />
            );
          })()}
          
          {/* CameraTracker polling disabled to prevent infinite loop - camera updates only on seat change */}
          
          {/* Mesh markers */}
          <MeshMarkers visibleMarkers={visibleMarkers} meshes={modelMeshes} />
          
          {/* Preview generated seats */}
          <PreviewSeats seats={previewSeats} showPreview={showPreview} />
          
          <gridHelper args={[20, 20]} />
          <axesHelper args={[5]} />
        </Canvas>
        
        {/* Discussion Mode Button - Host Only (Pill-shaped, auto-hides) */}
        {isHost && showDiscussionModeButton && (
          <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-40">
            <button
              onClick={toggleDiscussionMode}
              className={`px-6 py-3 rounded-full font-semibold text-white transition-all duration-300 transform hover:scale-110 ${
                discussionMode
                  ? 'bg-gradient-to-r from-red-600 to-red-500 shadow-lg shadow-red-500/50'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/50'
              }`}
              title={discussionMode ? 'Exit Discussion Mode' : 'Enter Discussion Mode'}
            >
              {discussionMode ? '🎤 Discussion Mode: ON' : '🎤 Enable Discussion Mode'}
            </button>
          </div>
        )}
        
        {/* 🎮 View Control Icons (Left/Center/Right + Turnaround for Host) */}
        {showViewIcons && (
          <>
            {/* Left Arrow Icon */}
            {currentViewDirection !== 'left' && (
              <button
                onClick={() => {
                  if (currentViewDirection === 'center') {
                    switchViewDirection('left');
                  } else if (currentViewDirection === 'right') {
                    switchViewDirection('center');
                  }
                }}
                className="absolute left-2 md:left-8 top-1/2 transform -translate-y-1/2 z-40 bg-black/60 hover:bg-black/80 p-2 md:p-4 rounded-full transition-all duration-300 hover:scale-110 touch-manipulation"
                title={currentViewDirection === 'center' ? 'Look Left' : 'Look Center'}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-6 w-6 md:h-8 md:w-8 text-white" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            
            {/* Right Arrow Icon */}
            {currentViewDirection !== 'right' && (
              <button
                onClick={() => {
                  if (currentViewDirection === 'center') {
                    switchViewDirection('right');
                  } else if (currentViewDirection === 'left') {
                    switchViewDirection('center');
                  }
                }}
                className="absolute right-2 md:right-8 top-1/2 transform -translate-y-1/2 z-40 bg-black/60 hover:bg-black/80 p-2 md:p-4 rounded-full transition-all duration-300 hover:scale-110 touch-manipulation"
                title={currentViewDirection === 'center' ? 'Look Right' : 'Look Center'}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-6 w-6 md:h-8 md:w-8 text-white" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            
            {/* 🔄 Turnaround Icon (Host Only) - Positioned above right arrow */}
            {isHost && (
              <button
                onClick={handleTurnaround}
                className="absolute right-2 md:right-8 top-1/2 -mt-20 md:-mt-32 z-40 bg-blue-600/80 hover:bg-blue-700/90 p-2 md:p-3 rounded-lg transition-all duration-300 hover:scale-110 flex flex-col items-center gap-1 touch-manipulation"
                title={`Turn to view ${hostViewSeat === 145 ? 'Board' : 'Students'}`}
              >
                <img 
                  src="/icons/turnaround.svg" 
                  alt="Turnaround" 
                  className="h-5 w-5 md:h-6 md:w-6 filter invert"
                />
                <span className="text-white text-[9px] md:text-[10px] font-semibold whitespace-nowrap">
                  {hostViewSeat === 145 ? 'Board' : 'Students'}
                </span>
              </button>
            )}
          </>
        )}
        
        {/* Overlay - Camera & Click Position Display */}
        {showPositionDebug && showDebugPanels && (
          <div className="absolute top-4 left-4 bg-black/70 rounded-lg p-4 space-y-3 text-xs">
            <div className="font-bold text-blue-400">📹 Camera Position</div>
            <div className="font-mono">
              X: {cameraPosition.x}<br />
              Y: {cameraPosition.y}<br />
              Z: {cameraPosition.z}
            </div>
            
            {/* Save Camera Section */}
            <div className="border-t border-gray-600 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-bold text-green-400">💾 Save Camera View</div>
                <div className="text-xs font-bold text-blue-400">
                  Saved: {Object.keys(savedCameraPositions).length}/145
                </div>
              </div>
              
              {/* Export Button */}
              <button
                onClick={handleExportCameraPositions}
                className="w-full px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium transition-colors"
                disabled={Object.keys(savedCameraPositions).length === 0}
              >
                📦 Export JSON
              </button>
              
              {/* Seat Navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevSeat}
                  className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                >
                  ← Prev
                </button>
                <div className="text-gray-300 text-xs text-center">
                  {previewSeats.length > 0 ? `${currentSeatIndex + 1} / ${previewSeats.length}` : '0 / 145'}
                  {previewSeats.length > 0 && savedCameraPositions[previewSeats[currentSeatIndex]?.id] && <div className="text-green-400">✓</div>}
                </div>
                <button
                  onClick={handleNextSeatCycle}
                  className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                >
                  Next →
                </button>
              </div>
              
              <div>
                <label className="text-gray-300 text-xs">Seat No:</label>
                <input
                  type="number"
                  min="1"
                  max="145"
                  value={modalSeatNumber}
                  onChange={(e) => setModalSeatNumber(parseInt(e.target.value) || 1)}
                  className="w-full px-2 py-1 bg-gray-700 text-white rounded text-xs mt-1"
                />
              </div>
              
              {controlsRef.current && (
                <div>
                  <div className="text-gray-300 text-xs">Coordinates:</div>
                  <div className="font-mono text-gray-400 text-xs">
                    X: {controlsRef.current.object.position.x.toFixed(2)}<br />
                    Y: {controlsRef.current.object.position.y.toFixed(2)}<br />
                    Z: {controlsRef.current.object.position.z.toFixed(2)}
                  </div>
                </div>
              )}
              
              <div>
                <div className="text-gray-300 text-xs">Looking at:</div>
                <div className="font-mono text-gray-400 text-xs">
                  {modalSeatNumber === 145 ? (
                    <>Middle Column [38.9, 61.5, -47.2]</>
                  ) : (
                    <>Blackboard [3.5, 76.4, -218.0]</>
                  )}
                </div>
              </div>
              
              <button
                onClick={handleSaveCameraFromModal}
                className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors"
              >
                💾 Save (P)
              </button>
            </div>
            
            {clickedPosition && (
              <>
                <div className="font-bold text-gray-400 mt-3 pt-3 border-t border-gray-600">👆 Clicked Position</div>
                <div className="font-mono">
                  X: {clickedPosition.x}<br />
                  Y: {clickedPosition.y}<br />
                  Z: {clickedPosition.z}
                </div>
              </>
            )}
          </div>
        )}
        
        {/* Seat Cycling Control Panel */}
        {showSeatCycling && previewSeats.length > 0 && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-sm rounded-lg p-4 border border-gray-600 space-y-3">
            {(() => {
              // ✅ Debug logging for modal state
              // console.log('🎯 [Seat Modal Render]:', {
              //   currentSeatIndex,
              //   seatAtIndex: previewSeats[currentSeatIndex]?.id,
              //   userCurrentSeat: userSeats[currentUser?.id],
              //   selectedSeatId,
              //   totalSeats: previewSeats.length,
              //   isHost,
              //   currentUserId: currentUser?.id
              // });
              return null;
            })()}
            {/* Current Seat Label */}
            <div className="text-center">
              <div className="text-xl font-bold text-white">
                {previewSeats[currentSeatIndex]?.isHost ? '👨‍🏫 Host Position' : `Seat ${previewSeats[currentSeatIndex]?.id}`}
              </div>
              {!previewSeats[currentSeatIndex]?.isHost && (
                <div className="text-xs text-gray-400 mt-1">
                  Row {Math.ceil(previewSeats[currentSeatIndex]?.id / (previewSeats[currentSeatIndex]?.id <= 40 ? 5 : previewSeats[currentSeatIndex]?.id <= 104 ? 8 : 5))}, 
                  Column {previewSeats[currentSeatIndex]?.id <= 40 ? 1 : previewSeats[currentSeatIndex]?.id <= 104 ? 2 : 3}
                </div>
              )}
            </div>
            
            {/* Navigation Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevSeat}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-white transition-colors"
              >
                ← Prev
              </button>
              <div className="text-gray-300 text-sm">
                {currentSeatIndex + 1} / {previewSeats.length}
                {savedCameraPositions[previewSeats[currentSeatIndex]?.id] && <span className="text-green-400 ml-2">✓ Saved</span>}
              </div>
              <button
                onClick={handleNextSeatCycle}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium text-white transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
        
        {/* View Direction Modal - Enhanced with Seat Cycling */}
        {showViewDirectionModal && selectedSeatId && (
          <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-[1001]">
            <div className="bg-black/90 backdrop-blur-sm rounded-lg p-4 border border-purple-500 shadow-2xl min-w-[400px]">
              {/* Header with Seat Counter */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-purple-400 font-medium">
                  👁️ View Direction
                </div>
                <div className="text-sm text-gray-300 font-mono">
                  Seat {selectedSeatId} / 145
                  {markedSeats.includes(selectedSeatId) && <span className="ml-2 text-yellow-400">⭐</span>}
                </div>
              </div>
              
              {/* Seat Cycling Navigation */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={handlePrevSeat}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  ⬅️ Prev Seat
                </button>
                <button
                  onClick={handleNextSeatCycle}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Next Seat ➡️
                </button>
              </div>
              
              {/* View Direction Buttons */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  onClick={() => switchViewDirection('left')}
                  disabled={!lectureHallLeftRightViews[selectedSeatId]?.left}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    currentViewDirection === 'left'
                      ? 'bg-blue-600 ring-2 ring-blue-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  ← Left
                </button>
                <button
                  onClick={() => switchViewDirection('center')}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    currentViewDirection === 'center'
                      ? 'bg-purple-600 ring-2 ring-purple-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  • Center
                </button>
                <button
                  onClick={() => switchViewDirection('right')}
                  disabled={!lectureHallLeftRightViews[selectedSeatId]?.right}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    currentViewDirection === 'right'
                      ? 'bg-green-600 ring-2 ring-green-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  Right →
                </button>
              </div>
              
              {/* Mark/Review Controls */}
              <div className="border-t border-gray-700 pt-3 space-y-2">
                <button
                  onClick={toggleMarkSeat}
                  className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    markedSeats.includes(selectedSeatId)
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {markedSeats.includes(selectedSeatId) ? '⭐ Marked for Review' : '☆ Mark for Review'}
                </button>
                
                {markedSeats.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={exportMarkedSeats}
                      className="flex-1 bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    >
                      📥 Export ({markedSeats.length})
                    </button>
                    <button
                      onClick={clearMarkedSeats}
                      className="flex-1 bg-red-700 hover:bg-red-600 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                    >
                      🗑️ Clear All
                    </button>
                  </div>
                )}
                
                {markedSeats.length > 0 && (
                  <div className="text-[10px] text-gray-400 text-center">
                    Marked seats: {markedSeats.slice(0, 10).join(', ')}{markedSeats.length > 10 ? '...' : ''}
                  </div>
                )}
              </div>
              {(!lectureHallLeftRightViews[selectedSeatId]?.left || !lectureHallLeftRightViews[selectedSeatId]?.right) && (
                <div className="text-[10px] text-yellow-400 text-center mt-2">
                  ⚠️ Some views unavailable for this seat
                </div>
              )}
              <button
                onClick={() => setShowViewDirectionModal(false)}
                className="w-full mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
        
        {/* Audio automatically requested on join - no manual button needed */}
        
        {/* Taskbar for navigation controls */}
        <Taskbar
          watchType="classroom"
          classType={modelType === 'lecture-hall' ? 'lecture_hall' : 'classroom'}
          authenticatedUserID={currentUser?.id}
          isAudioActive={isAudioActive}
          toggleAudio={handleToggleAudio}
          isHost={isHostFromState}
          openChat={handleOpenChat}
          onMembersClick={handleMembersClick}
          showPositionDebug={showPositionDebug}
          onTogglePositionDebug={setShowPositionDebug}
          onShareRoom={() => toast('Share feature coming soon!')}
          onSeatsClick={handleSeatsClick}
          watchSessionMembers={watchSessionMembers}
          userSeats={userSeats}
          currentUser={currentUser}
          isViewLocked={isViewLocked}
          setIsViewLocked={setIsViewLocked}
          lightsOn={lightsOn}
          setLightsOn={setLightsOn}
          isCameraOn={false}
          toggleCamera={() => {}}
          showSeatMarkers={showSeatMarkers}
          onToggleSeatMarkers={setShowSeatMarkers}
          onLeaveCall={handleExit}
          audioDevices={audioDevices}
          selectedAudioDeviceId={selectedAudioDeviceId}
          onAudioDeviceChange={changeAudioDevice}
          discussionMode={discussionMode}
          onToggleDiscussionMode={toggleDiscussionMode}
          availableCameras={[]}
          isLeftSidebarOpen={isLeftSidebarOpen}
          onEmoteSend={() => {}}
          showProgram={true} // Enable Board button for classroom
          showEmotes={false}
          showVideoToggle={false}
          onToggleLeftSidebar={() => setIsLeftSidebarOpen(prev => !prev)}
          seatSwapRequest={seatSwapRequest}
          isSilenceMode={false}
          onToggleSilenceMode={() => {}}
          handRaised={handRaised}
          hasHostApproval={hasHostApproval}
          onRaiseHand={handleRaiseHand}
          onLowerHand={handleLowerHand}
          raisedHands={raisedHands}
          onApproveSpeaker={handleApproveSpeaker}
          onRevokeSpeaker={handleRevokeSpeaker}
          approvedSpeakers={approvedSpeakers}
          showDebugPanels={showDebugPanels}
          onToggleDebugPanels={setShowDebugPanels}
          freeRoamMode={freeRoamMode}
          setFreeRoamMode={setFreeRoamMode}
          lockMovement={lockMovement}
          setLockMovement={setLockMovement}
          lockOrbit={lockOrbit}
          setLockOrbit={setLockOrbit}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          showAvatars={showAvatars}
          setShowAvatars={setShowAvatars}
          showCameraMarkers={showCameraMarkers}
          setShowCameraMarkers={setShowCameraMarkers}
          showPositionDebugLectureHall={showPositionDebug}
          onTogglePositionDebugLectureHall={setShowPositionDebug}
          showAudioDebugPanel={showAudioDebugPanel}
          onToggleAudioDebugPanel={setShowAudioDebugPanel}
          showViewDirectionModal={showViewDirectionModal}
          onToggleViewDirectionModal={setShowViewDirectionModal}
          onExportCameraPositions={handleExportCameraPositions}
          savedCameraPositionsCount={Object.keys(savedCameraPositions).length}
          freeCameraMovement={freeCameraMovement}
          setFreeCameraMovement={setFreeCameraMovement}
          demoMode={demoMode}
          setDemoMode={setDemoMode}
          unreadMessages={unreadMessages}
        />
      </div>
      
      {/* Side Panel - Seat Management */}
      {showDebugPanels && (
      <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">
            {modelType === 'classroom' ? '🎓 Classroom' : '🏛️ Lecture Hall'}
          </h2>
          <p className="text-sm text-gray-400">
            Total Seats: {totalSeats}
          </p>
          <div className="mt-2 space-y-2">
            <button
              onClick={() => setShowMeshInspector(!showMeshInspector)}
              className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm font-medium transition-colors"
            >
              🔍 {showMeshInspector ? 'Hide' : 'Show'} Mesh Inspector
            </button>
            <button
              onClick={handleLoadGeneratedSeats}
              className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm font-medium transition-colors"
            >
              🎯 Load Generated Seats (145)
            </button>
            {previewSeats.length > 0 && (
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`w-full px-3 py-1 rounded text-sm font-medium transition-colors ${
                  showPreview ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {showPreview ? '👁️ Hide Preview' : '👁️ Show Preview'}
              </button>
            )}
          </div>
        </div>
        
        {/* Mesh Inspector (Collapsible) */}
        {showMeshInspector && (
          <div className="p-4 border-b border-gray-700 bg-gray-750 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-purple-400">Model Meshes ({modelMeshes.length})</h3>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={handleExportMeshData}
                  className="bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded text-xs"
                >
                  📋 Export All
                </button>
                <button
                  onClick={showAllMarkers}
                  className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                >
                  Show All
                </button>
                <button
                  onClick={hideAllMarkers}
                  className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                >
                  Hide All
                </button>
                <button
                  onClick={handleAutoImportSeats}
                  className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
                >
                  Auto-Import
                </button>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              {modelMeshes.length === 0 ? (
                <p className="text-gray-500">Loading meshes...</p>
              ) : (
                modelMeshes.map((mesh, idx) => {
                  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff'];
                  const markerColor = colors[idx % colors.length];
                  
                  return (
                    <div key={idx} className="bg-gray-800 p-2 rounded flex items-start gap-2">
                      <button
                        onClick={() => toggleMarker(idx)}
                        className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                          visibleMarkers[idx] 
                            ? 'border-green-500 bg-green-500' 
                            : 'border-gray-600 bg-gray-700'
                        }`}
                        style={{
                          backgroundColor: visibleMarkers[idx] ? markerColor : undefined
                        }}
                      >
                        {visibleMarkers[idx] && <span className="text-white text-xs">✓</span>}
                      </button>
                      <div className="flex-1">
                        <div className="font-mono text-green-400">{mesh.name || 'Unnamed'}</div>
                        <div className="text-gray-400">
                          [{mesh.position.x}, {mesh.position.y}, {mesh.position.z}]
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        
        {/* Modal content removed - seat positions are now managed via imported JSON */}
        
        {/* Controls Guide */}
        <div className="p-4 border-t border-gray-700 text-xs text-gray-400 space-y-1">
          <div className="font-bold text-white mb-2">🎮 Controls</div>
          <div className="font-bold text-yellow-400 mt-2">Keyboard:</div>
          <div>• W/A/S/D: Move forward/left/back/right</div>
          <div>• C: Move up (raise height)</div>
          <div>• V: Move down (lower height)</div>
          <div className="font-bold text-yellow-400 mt-2">Mouse:</div>
          <div>• Left-click + drag: Rotate view</div>
          <div>• Right-click + drag: Pan view</div>
          <div>• Scroll: Zoom in/out</div>
          <div>• Click on model: Select position</div>
        </div>
      </div>
      )}
      
      {/* Modals */}
      {/* Seat Swap Notification */}
      {swapNotification && (
        <SeatSwapNotification
          request={swapNotification}
          onAccept={acceptSwap}
          onDecline={declineSwap}
        />
      )}
      
      {/* Members Modal */}
      {isMembersModalOpen && (
        <LectureHallMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          members={watchSessionMembers}
          userSeats={userSeats}
          isHost={isHostFromState}
          currentUserId={currentUser?.id}
          audioStates={remoteAudioStates}
          raisedHands={raisedHands}
          approvedSpeakers={approvedSpeakers}
          onApproveSpeaker={handleApproveSpeaker}
          onRevokeSpeaker={handleRevokeSpeaker}
          onMemberClick={handleOpenPrivateChat}
          discussionMode={discussionMode}
        />
      )}
      
      {/* Seats Grid Modal */}
      {isSeatsModalOpen && (
        <LectureHallSeatsGrid
          isOpen={isSeatsModalOpen}
          onClose={() => setIsSeatsModalOpen(false)}
          userSeats={userSeats}
          watchSessionMembers={watchSessionMembers}
          currentUserId={currentUser?.id}
          onTakeSeat={handleTakeSeat}
          onSwapRequest={handleSeatSwapRequest}
          currentHallNumber={currentLectureHall}
          totalHalls={totalLectureHalls}
          onHallChange={(hallNumber) => {
            console.log(`🏫 [Hall Switch] Host viewing hall ${hallNumber}`);
            setViewingHallNumber(hallNumber);
          }}
          isHost={isHost}
        />
      )}
      
      {/* Chat Home Modal */}
      {showChatHome && (
        <ChatHomeModal
          isOpen={showChatHome}
          onClose={() => setShowChatHome(false)}
          onOpenRoomChat={handleOpenRoomChat}
          onOpenPrivateChat={handleOpenPrivateChat}
          watchSessionMembers={watchSessionMembers}
          currentUserId={currentUser?.id}
          currentUser={currentUser}
          roomMembers={watchSessionMembers}
          privateMessages={privateMessages}
          unreadMessages={unreadMessages}
          watchType="classroom"
        />
      )}

      {/* Session Chat Modal - Inline Floating */}
      {isChatOpen && (
        <div
          className="fixed bottom-24 right-4 w-80 bg-black/80 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl z-50 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-3 border-b border-gray-700">
            <h3 className="text-white font-medium">Class Chat</h3>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-gray-400 hover:text-white text-2xl leading-none"
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
                <div key={msg.ID} className="text-white text-sm">
                  <div>
                    <span className="font-medium text-purple-300">
                      {msg.Username || msg.username || `User${msg.UserID || msg.user_id}`}:
                    </span>{' '}
                    <span>{msg.Message || msg.message}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-800/50 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                onKeyPress={(e) => e.key === 'Enter' && handleSendRoomMessage()}
              />
              <button
                onClick={handleSendRoomMessage}
                disabled={!newMessage.trim()}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Left Sidebar - Board/Quiz Management */}
      {isLeftSidebarOpen && (
        <LeftSidebar
          roomId={actualRoomId}
          currentMedia={null}
          mousePosition={{ x: 0, y: 0 }}
          isLeftSidebarOpen={isLeftSidebarOpen}
          isScreenSharingActive={isScreenSharingActive}
          sharingSource={sharingSource}
          isLiveKitConnected={isLivekitConnected}
          onEndScreenShare={handleEndScreenShare}
          isConnected={isConnected}
          playlist={temporaryPlaylist}
          currentUser={currentUser}
          sendMessage={sendMessage}
          onDeleteMedia={() => {}}
          onStartScreenShare={handleStartScreenShare}
          onMediaSelect={handleMediaSelect}
          onCameraPreview={() => {}}
          isHost={isHost}
          onClose={() => setIsLeftSidebarOpen(false)}
          onUploadComplete={handleUploadComplete}
          sessionId={actualSessionId}
          onQuizClick={handleQuizClick}
          activeQuiz={activeQuiz}
          quizHistory={quizHistory}
          onTakeQuiz={handleTakeQuiz}
          watchType="classroom"
          classType={modelType === 'lecture-hall' ? 'lecture_hall' : 'classroom'}
        />
      )}
      
      {/* Private Chat Modal */}
      {privateChatOpen && selectedChatUser && (
        <PrivateChatModal
          otherUser={selectedChatUser}
          messages={privateMessages[selectedChatUser.id] || []}
          onSendMessage={handleSendPrivateMessage}
          onClose={() => {
            setPrivateChatOpen(false);
            setPrivateChatUserId(null);
            setSelectedChatUser(null);
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
      
      {/* Quiz Management Modal (Host Only) */}
      {isQuizManagementOpen && (
        <QuizManagementModal
          isOpen={isQuizManagementOpen}
          onClose={() => setIsQuizManagementOpen(false)}
          isHost={isHost}
          quizzes={quizzes}
          activeQuiz={activeQuiz}
          quizProgress={quizProgress}
          quizHistory={quizHistory}
          onCreateQuiz={handleCreateQuiz}
          onViewResults={handleViewResults}
          onTakeQuiz={handleTakeQuiz}
          sendMessage={sendMessage}
          currentUser={currentUser}
          sessionId={actualSessionId}
          quizExportData={quizExportData}
        />
      )}
      
      {/* Make Quiz Modal (Host Only) */}
      {isMakeQuizOpen && isHost && (
        <MakeQuizModal
          isOpen={isMakeQuizOpen}
          onClose={() => {
            setIsMakeQuizOpen(false);
            setIsQuizManagementOpen(true);
          }}
          sendMessage={sendMessage}
          currentUser={currentUser}
          roomId={actualRoomId}
          sessionId={actualSessionId}
        />
      )}

      {/* Take Quiz Modal (Students Only) */}
      {isTakeQuizOpen && !isHost && activeQuiz && (
        <TakeQuizModal
          isOpen={isTakeQuizOpen}
          onClose={() => {
            setIsTakeQuizOpen(false);
            setQuizResults(null);
          }}
          quiz={activeQuiz}
          results={quizResults}
          sendMessage={sendMessage}
          currentUser={currentUser}
        />
      )}

      {/* ✅ [AUDIO SYSTEM] Audio elements now managed via trackSubscribed event
          - Audio players created dynamically when tracks arrive (handleTrackSubscribed)
          - Stored in audioElementsRef (survives React remounts)
          - Removed from DOM via trackUnsubscribed event
          - No JSX rendering needed - pure DOM manipulation for stability
      */}
      
      {/* 🔍 Phase 1: LiveKit Audio Debug Panel */}
      {showAudioDebugPanel && isLivekitConnected && livekitRoom && (
        <LiveKitAudioDebugPanel
          livekitRoom={livekitRoom}
          currentUser={currentUser}
          userSeat={currentSeat?.id}
          isHost={isHost}
          hasHostApproval={hasHostApproval}
          isAudioActive={isAudioActive}
          localStream={localStream}
          userSeats={userSeats}
          getAudioRecipients={getAudioRecipients}
          remoteAudioStates={remoteAudioStates}
        />
      )}
      
      {/* Blackboard Media Player - DISABLED: Media now renders on 3D blackboard mesh */}
      {/* {blackboardMedia && (
        <BlackboardMediaPlayer
          media={blackboardMedia}
          onClose={() => setBlackboardMedia(null)}
          isFullscreen={isMediaFullscreen}
          onToggleFullscreen={() => setIsMediaFullscreen(prev => !prev)}
        />
      )} */}
      
      {/* ✅ Fullscreen Player - Conditionally render based on media type */}
      {isMediaFullscreen && blackboardMedia && (
        <>
          {/* LiveShare/WatchFrom Fullscreen - For screen share streams */}
          {(blackboardMedia.type === 'liveshare' || blackboardMedia.type === 'watchfrom') && (
            <LiveShareFullscreen
              stream={blackboardMedia.stream}
              cameraStream={blackboardMedia.cameraStream}
              onExit={() => setIsMediaFullscreen(false)}
              liveShareMode={liveShareMode}
            />
          )}
          
          {/* Uploaded Media Fullscreen - Shared video with CSS toggle (no duplicate element) */}
          {blackboardMedia.type !== 'liveshare' && blackboardMedia.type !== 'watchfrom' && (
            <div className="fixed inset-0 z-[9999]">
              {/* Close button with auto-hide */}
              <button
                onClick={() => setIsMediaFullscreen(false)}
                className={`absolute left-4 top-4 z-[9999] bg-black/70 text-white p-3 rounded-full hover:bg-black/90 transition-all duration-300 ${
                  showFullscreenControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                aria-label="Exit fullscreen"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* 👤 User Profile Modal (Avatar Click) */}
      {isProfileModalOpen && profileModalUser && (
        <UserProfileModal
          user={profileModalUser}
          isOpen={isProfileModalOpen}
          onClose={() => {
            setIsProfileModalOpen(false);
            setProfileModalUser(null);
          }}
          onMessage={profileModalUser?.id !== currentUser?.id ? () => {
            // Open private chat with the clicked user
            setIsProfileModalOpen(false);
            setSelectedChatUser(profileModalUser);
            setPrivateChatUserId(profileModalUser.id);
            setPrivateChatOpen(true);
          } : undefined}
          friendshipStatus={friendshipStatus}
          isRequester={isRequester}
          onAddFriend={handleFriendRequest}
          isInWatchSession={true}
        />
      )}

      {/* 🎁 Floating Gift Icon - Only shows for non-hosts in active sessions
          TODO: Future enhancement - Multi-host scenarios
          - Allow hosts to donate to other hosts
          - Room vs Room competitions with donations
          - Co-host/moderator donation permissions
      */}
      {!isHost && sessionStatus?.hostId && (
        <FloatingGiftIcon
          hostId={sessionStatus.hostId}
          currentUserId={currentUser?.id}
          tokenBalance={tokenBalance}
          isVisible={!isMediaFullscreen}
          isFullscreen={isMediaFullscreen}
          isLeftSidebarOpen={isLeftSidebarOpen}
          onGiftSent={(updatedBalance) => {
            setTokenBalance(updatedBalance.token_balance);
          }}
        />
      )}

      {/* 🎊 Donation Notifications - Visible to ALL users (including host) */}
      <DonationNotification
        messages={messages}
        currentUserId={currentUser?.id}
      />

      {/* 🔄 Loading overlay - Shows during seat assignment */}
      {loadingStatus && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-white"></div>
        </div>
      )}

      {/* 📱 Orientation Modal - Suggest landscape mode for better experience */}
      {showOrientationModal && isPortraitMode && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 max-w-sm w-full border-2 border-blue-500/50 shadow-2xl">
            {/* Rotating phone icon animation */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 rounded-full p-6 animate-bounce">
                  <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <div className="absolute -right-2 -top-2">
                    <svg className="w-8 h-8 text-yellow-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Message */}
            <h3 className="text-white text-xl font-bold text-center mb-3">
              Best Experience in Landscape
            </h3>
            <p className="text-gray-300 text-center text-sm mb-6 leading-relaxed">
              For the best 3D lecture hall experience, we recommend rotating your device to <span className="text-blue-400 font-semibold">landscape mode</span>. This gives you a wider view and better controls!
            </p>

            {/* Button */}
            <button
              onClick={() => {
                setShowOrientationModal(false);
                sessionStorage.setItem('wewatch_orientation_dismissed', 'true');
              }}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg"
            >
              Got it! 👍
            </button>
            
            {/* Helpful hint */}
            <p className="text-gray-500 text-xs text-center mt-4">
              You can still use portrait mode if you prefer
            </p>
          </div>
        </div>
      )}

    </div>
  );
};

export default PositionCalculatorPage;
