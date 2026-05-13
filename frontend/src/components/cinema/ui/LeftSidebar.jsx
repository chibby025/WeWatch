// src/components/cinema/ui/LeftSidebar.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadMediaToRoom, uploadChunk, apiClient, API_BASE_URL } from '../../../services/api';
import { Gamepad2, Video, BookOpen, Music } from 'lucide-react'; // Game, Video, Bible, and Hymn icons
import toast from 'react-hot-toast';
import BibleControl from '../../liveshare/BibleControl';
import HymnsControl from '../../liveshare/HymnsControl';
import useSessionRecording from '../../../hooks/useSessionRecording';
import RecordingOptionsModal from '../../RecordingOptionsModal';
import { 
  splitFileIntoChunks, 
  generateUploadId, 
  uploadChunkWithRetry,
  uploadChunksParallel,
  getOptimalChunkSize,
  getUploadConcurrency,
  saveChunkUploadState,
  clearChunkUploadState 
} from '../../../utils/uploadChunker';
import { useUploadServiceWorker } from '../../../hooks/useUploadServiceWorker';
import LiveShareManager from './LiveShareManager';

export default function LeftSidebar({
  roomId,
  currentMedia,
  mousePosition,
  isLeftSidebarOpen,
  isScreenSharingActive,
  sharingSource, // 'liveshare' | 'watchfrom' | null
  isLiveKitConnected, // ✅ NEW: LiveKit connection status
  onEndScreenShare,
  isConnected,
  playlist,
  currentUser,
  sendMessage,
  onDeleteMedia,
  onResumeMedia, // Resume media from saved position
  onStartScreenShare,
  onMediaSelect,
  onCameraPreview,
  isHost: isHostProp,
  onClose,
  onUploadComplete,
  sessionId,
  finalSessionId, // For resume state detection
  onQuizClick, // Quiz management button handler
  onGameClick, // Game lobby button handler
  onGameClose, // Game close handler (for End Game button)
  activeGame, // Currently active game (for Start/End Game button)
  activeQuiz, // Currently active quiz (for students)
  quizHistory, // Quiz history with active_quizzes array (for late joiners)
  onTakeQuiz, // Handler for student to take quiz
  onSessionCleanup, // ✅ Callback to expose cleanup function to parent
  watchType, // 'video', '3d_cinema', or 'classroom'
  classType, // 'classroom' or 'lecture_hall'
  darknessLevel, // ✅ NEW: 'regular' | 'extreme'
  onDarknessLevelChange, // ✅ NEW: Handler for darkness level changes
  // ✅ LiveShare props
  watchSessionMembers = [], // Array of members in watch session
  liveShareMode = 'regular', // Current LiveShare share type (camera/screen/both)
  liveShareContentMode = null, // Content mode ('regular', 'podcast', 'news', 'show')
  liveShareGuest = null, // Active guest object or null
  hasLiveSharePermission = false, // Boolean for members (is LiveShare tab visible?)
  onLiveShareModeSelect, // Handler for mode selection
  onLiveShareTypeSelect, // Handler for share type selection
  onGrantLiveSharePermission, // Handler for granting permission
  onRevokeLiveSharePermission, // Handler for revoking permission
  onKickLiveShareGuest, // Handler for kicking guest
  cameraShareTrackRef, // ✅ NEW: Ref to LiveKit camera track for mute/unmute during breaks
  graphicsRendererRef, // ✅ NEW: Ref to GraphicsRenderer for break screen overlay
  onWizardStateChange, // ✅ NEW: Callback to notify parent when wizard opens/closes
  forceActiveTab = null, // Force switch to specific tab
  isSessionPrivate = false, // ✅ NEW: If true, session was created as private (enforces Ghost Mode)
  sessionStatus = null, // ✅ NEW: Full session status object for self-validation fallback
}) {
  // ✅ Host verification state
  const [isHost, setIsHost] = useState(isHostProp);
  const [isVerifyingHost, setIsVerifyingHost] = useState(false);
  
  // ✅ Verify host status when sidebar opens
  useEffect(() => {
    const verifyHostStatus = async () => {
      if (!isLeftSidebarOpen || !roomId || !currentUser?.id) return;
      
      setIsVerifyingHost(true);
      try {
        // ✅ Use apiClient which has withCredentials: true (cookie-based auth)
        const response = await apiClient.get(`/api/rooms/${roomId}`);
        
        // ✅ Backend wraps room data in "room" property
        const roomData = response.data.room || response.data;
        const isUserHost = roomData.host_id === currentUser?.id;
        // console.log('🔍 [LeftSidebar] Host verification:', { 
        //   hostId: roomData.host_id, 
        //   userId: currentUser?.id, 
        //   isHost: isUserHost,
        //   wasHostProp: isHostProp
        // });
        setIsHost(isUserHost);
      } catch (error) {
        console.error('❌ [LeftSidebar] Host verification error:', error);
        // Fallback to prop on error
        setIsHost(isHostProp);
      } finally {
        setIsVerifyingHost(false);
      }
    };
    
    verifyHostStatus();
  }, [isLeftSidebarOpen, roomId, currentUser?.id, isHostProp]);
  
  // Dynamically determine available tabs
  // ✅ Host sees all tabs; Members see 'upload' + 'liveshare' (if permission granted)
  const availableTabs = isHost 
    ? ['upload', 'liveshare', 'watchfrom'] 
    : hasLiveSharePermission 
      ? ['upload', 'liveshare'] 
      : ['upload'];
  
  // 🐛 DEBUG: Log permission state changes
  useEffect(() => {
    console.log('📊 [LeftSidebar] Permission state:', {
      isHost,
      hasLiveSharePermission,
      availableTabs,
      currentUserId: currentUser?.id,
      currentUserName: currentUser?.username
    });
  }, [hasLiveSharePermission, isHost, currentUser?.id]);
  
  // ✅ Persist active tab in sessionStorage (clears on session end)
  const getInitialTab = () => {
    const savedTab = sessionStorage.getItem('wewatch_active_sidebar_tab');
    // Only use saved tab if it's available for current user
    if (savedTab && availableTabs.includes(savedTab)) {
      return savedTab;
    }
    return availableTabs[0];
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  
  // ✅ Force tab switch when requested by parent
  useEffect(() => {
    if (forceActiveTab && availableTabs.includes(forceActiveTab)) {
      setActiveTab(forceActiveTab);
    }
  }, [forceActiveTab, availableTabs]);
  
  // ✅ Save tab to sessionStorage when it changes (clears on session end)
  useEffect(() => {
    sessionStorage.setItem('wewatch_active_sidebar_tab', activeTab);
  }, [activeTab]);

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [selectedCamera, setSelectedCamera] = useState('none');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 🔗 URL Streaming State
  const [streamUrl, setStreamUrl] = useState('');
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);
  const [urlError, setUrlError] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const sidebarRef = useRef(null);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState('');
  const currentPreviewStreamRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0); // MB/s
  const [uploadETA, setUploadETA] = useState(''); // Estimated time remaining
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const uploadAbortControllerRef = useRef(null);
  const uploadStartTimeRef = useRef(null);
  const lastProgressUpdateRef = useRef(0); // Throttle progress updates
  const progressPersistenceTimerRef = useRef(null); // Save progress every 5s
  
  // Network quality state
  const [networkQuality, setNetworkQuality] = useState('unknown'); // '2g', '3g', '4g', 'wifi', 'unknown'
  
  // ✅ Service Worker for background uploads
  const uploadSW = useUploadServiceWorker();
  
  // Listen for SW status updates (not used in simplified approach but kept for future)
  useEffect(() => {
    if (!uploadSW.isRegistered) return;
    
    const unregister = uploadSW.onMessage('UPLOAD_STATUS', (data) => {
      console.log('[SW Status]:', data);
    });
    
    return unregister;
  }, [uploadSW.isRegistered]);
  
  const [showWatchFromInstructions, setShowWatchFromInstructions] = useState(false);
  const [showLiveShareMenu, setShowLiveShareMenu] = useState(false);
  const [showUploadDisclaimer, setShowUploadDisclaimer] = useState(false);
  const [showResumeUpload, setShowResumeUpload] = useState(false);
  const [pendingResumeData, setPendingResumeData] = useState(null);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => {
    return localStorage.getItem('wewatch_upload_terms_accepted') === 'true';
  });

  // 🔴 Recording state
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const {
    isRecording,
    recordingTime,
    isProcessing: recordingProcessing,
    uploadProgress: recordingUploadProgress,
    startRecording,
    stopRecording,
    cancelRecording,
    formatTime,
    maxDuration,
  } = useSessionRecording();

  // Alias for display
  const recordingDuration = recordingTime;
  
  // 📖 Bible & Hymn state (Religious content)
  const [showBibleSelector, setShowBibleSelector] = useState(false);
  const [showHymnSelector, setShowHymnSelector] = useState(false);
  
  // Check for incomplete uploads on mount
  useEffect(() => {
    const uploadId = localStorage.getItem('current_upload_id');
    if (!uploadId) return;
    
    const stateStr = localStorage.getItem(`upload_chunks_${uploadId}`);
    if (!stateStr) {
      localStorage.removeItem('current_upload_id');
      return;
    }
    
    const state = JSON.parse(stateStr);
    const uploadedChunks = state.uploadedChunks || [];
    const remainingChunks = [];
    
    for (let i = 0; i < state.totalChunks; i++) {
      if (!uploadedChunks.includes(i)) {
        remainingChunks.push(i);
      }
    }
    
    if (remainingChunks.length > 0) {
      console.log('📋 [Resume] Found incomplete upload:', {
        uploadId,
        fileName: state.fileName,
        progress: Math.round((uploadedChunks.length / state.totalChunks) * 100),
        remainingChunks: remainingChunks.length
      });
      
      setPendingResumeData(state);
      setShowResumeUpload(true);
    } else {
      // Upload was complete, clean up
      clearChunkUploadState(uploadId);
      localStorage.removeItem('current_upload_id');
    }
  }, []);
  
  // Detect network quality on mount
  useEffect(() => {
    const detectNetworkQuality = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (!connection) {
        setNetworkQuality('unknown');
        return;
      }
      
      const effectiveType = connection.effectiveType; // '2g', '3g', '4g', 'slow-2g'
      console.log('🌐 [Network Detection] Effective type:', effectiveType);
      
      if (effectiveType === 'slow-2g' || effectiveType === '2g') {
        setNetworkQuality('2g');
        console.log('📶 [Network] 2G detected - Using 2 concurrent chunks');
      } else if (effectiveType === '3g') {
        setNetworkQuality('3g');
        console.log('📶 [Network] 3G detected - Using 3 concurrent chunks');
      } else if (effectiveType === '4g') {
        setNetworkQuality('4g');
        console.log('📶 [Network] 4G detected - Using 5 concurrent chunks');
      } else {
        setNetworkQuality('wifi');
        console.log('📶 [Network] WiFi/Fast connection - Using 5 concurrent chunks');
      }
    };
    
    detectNetworkQuality();
    
    // Listen for connection changes
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      connection.addEventListener('change', detectNetworkQuality);
      return () => connection.removeEventListener('change', detectNetworkQuality);
    }
  }, []);
  
  // ✅ Handle beforeunload - Notify SW that upload was paused
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Only notify SW if actively uploading
      if (!uploading || !uploadSW.isRegistered) return;
      
      const uploadId = localStorage.getItem('current_upload_id');
      const stateStr = localStorage.getItem(`upload_chunks_${uploadId}`);
      
      if (!uploadId || !stateStr) return;
      
      const state = JSON.parse(stateStr);
      
      // Calculate remaining chunks
      const uploadedChunks = state.uploadedChunks || [];
      const remainingChunks = [];
      
      for (let i = 0; i < state.totalChunks; i++) {
        if (!uploadedChunks.includes(i)) {
          remainingChunks.push(i);
        }
      }
      
      if (remainingChunks.length === 0) return; // Already complete
      
      console.log(`⚠️ [Tab Close] Notifying SW - ${remainingChunks.length}/${state.totalChunks} chunks remaining`);
      
      // Notify Service Worker (will show notification)
      uploadSW.notifyUploadPaused({
        uploadId,
        fileName: state.fileName,
        fileSize: state.fileSize,
        totalChunks: state.totalChunks,
        uploadedChunks,
        remainingChunks,
        roomId: roomId || state.roomId,
        sessionId: sessionId || state.sessionId
      });
      
      // Browser will show confirmation dialog
      e.preventDefault();
      e.returnValue = 'Upload in progress. If you leave, you can resume when you return.';
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [uploading, uploadSW, roomId, sessionId]);


  // Helper function to check if media has saved resume state
  const getSavedResumeState = (mediaItem) => {
    if (!roomId || !finalSessionId || !mediaItem) return null;
    
    const mediaId = mediaItem.ID || mediaItem.id;
    const originalName = mediaItem.metadata?.originalName || mediaItem.originalName || mediaItem.title || mediaItem.original_name;
    const storageKey = `cinema_playback_${roomId}_${finalSessionId}_${originalName}_${mediaId}`;
    
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  // ✅ Session title state
  const [sessionTitle, setSessionTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState('');

  // 🖼️ Preview thumbnails toggle state (content moderation)
  // ✅ Initialize from isSessionPrivate - if session is private, Ghost Mode is enforced
  const [hidePreviewThumbnails, setHidePreviewThumbnails] = useState(isSessionPrivate);
  
  // � Sync Ghost Mode when session privacy changes OR on mount (handles late-arriving sessionStatus and lazy-loaded sidebar)
  useEffect(() => {
    console.log('👻 [LeftSidebar useEffect] Checking Ghost Mode enforcement:', {
      isSessionPrivate,
      currentHidePreviewThumbnails: hidePreviewThumbnails
    });
    
    if (isSessionPrivate) {
      console.log('👻 [LeftSidebar useEffect] ✅ ENFORCING Ghost Mode (setting hidePreviewThumbnails = true)');
      setHidePreviewThumbnails(true);
    } else {
      console.log('👻 [LeftSidebar useEffect] ℹ️ Session is not private, Ghost Mode is optional');
    }
  }, [isSessionPrivate]); // Runs on mount AND when isSessionPrivate changes
  
  // 🛡️ FALLBACK: Self-checking validation using sessionStatus directly
  // This runs independently to catch cases where prop arrives late or incorrect
  useEffect(() => {
    if (!sessionStatus || !isLeftSidebarOpen) return;
    
    const shouldEnforceGhost = sessionStatus.isPrivate || sessionStatus.hideFromLobby;
    
    console.log('🛡️ [LeftSidebar] Self-validation Ghost Mode check:', {
      sessionId: sessionStatus.id,
      isPrivate: sessionStatus.isPrivate,
      hideFromLobby: sessionStatus.hideFromLobby,
      shouldEnforceGhost,
      currentHidePreviewThumbnails: hidePreviewThumbnails,
      propValue: isSessionPrivate
    });
    
    // If self-check disagrees with current state, log warning and enforce
    if (shouldEnforceGhost && !hidePreviewThumbnails) {
      console.warn('⚠️ [LeftSidebar] Self-validation detected Ghost Mode should be enforced! Correcting state.');
      console.warn('⚠️ [LeftSidebar] Prop value was:', isSessionPrivate, 'but session data says:', shouldEnforceGhost);
      setHidePreviewThumbnails(true);
    }
  }, [sessionStatus, isLeftSidebarOpen, hidePreviewThumbnails, isSessionPrivate]); // Re-validate when sidebar opens or session changes

  // Auto-close sidebar when mouse leaves (unless screen sharing)
  useEffect(() => {
    if (!isLeftSidebarOpen || !sidebarRef.current) return;
    const sidebarWidth = sidebarRef.current.offsetWidth;
    const isMouseInSidebar = mousePosition.x < sidebarWidth;
    if (!isMouseInSidebar && !isScreenSharingActive) {
      onClose?.();
    }
  }, [mousePosition, isLeftSidebarOpen, isScreenSharingActive, onClose]);

  // Enumerate cameras when Liveshare tab is opened
  useEffect(() => {
    if (activeTab === 'liveshare') {
      enumerateDevices();
    }
  }, [activeTab]);

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
      console.error("Camera permission denied:", err);
      setCameraDevices([]);
    }
  };

  const handleCameraChange = async (deviceId) => {
    try {
      if (currentPreviewStreamRef.current) {
        currentPreviewStreamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId || true },
        audio: false
      });
      currentPreviewStreamRef.current = stream;
      if (onCameraPreview) onCameraPreview(stream);
    } catch (err) {
      console.error("Camera error:", err);
      alert("Camera unavailable.");
      if (onCameraPreview) onCameraPreview(null);
    }
  };

  // ✅ CLEANUP FUNCTION: No-op (compression removed, cleanup handled elsewhere)
  const cleanupSessionState = useCallback(() => {
    console.log('🧹 [LeftSidebar] Session cleanup called (no-op)');
    // Actual cleanup (temp media, posters) handled in websocket.go on session end
  }, []);

  // ✅ EXPOSE CLEANUP to parent via callback
  useEffect(() => {
    if (onSessionCleanup) {
      onSessionCleanup(cleanupSessionState);
    }
  }, [onSessionCleanup, cleanupSessionState]);

  // ✅ CHUNKED UPLOAD FUNCTION WITH PARALLEL UPLOADS
  const uploadFileChunked = async (file) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadETA('Calculating...');
    setUploadedBytes(0);
    setTotalBytes(file.size);
    uploadStartTimeRef.current = Date.now();
    lastProgressUpdateRef.current = Date.now();
    
    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;
    
    const uploadId = generateUploadId();
    const chunkSize = getOptimalChunkSize(networkQuality);
    const chunks = splitFileIntoChunks(file, chunkSize);
    
    console.log(`📦 [Chunked Upload] Starting:`, {
      uploadId,
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      totalChunks: chunks.length,
      chunkSize: formatFileSize(chunkSize)
    });
    
    saveChunkUploadState(uploadId, {
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks: chunks.length,
      uploadedChunks: [],
      sessionId,
      roomId
    });
    
    // Store upload ID for background transfer
    localStorage.setItem('current_upload_id', uploadId);

    try {
      const startTime = Date.now();
      const concurrency = getUploadConcurrency(networkQuality);
      
      console.log(`🚀 [Parallel Upload] Using ${concurrency} concurrent uploads for ${networkQuality}`);
      
      // Upload chunks in parallel batches
      await uploadChunksParallel({
        chunks,
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        roomId,
        sessionId,
        uploadFn: uploadChunk,
        concurrency,
        maxRetries: 3,
        onProgress: ({ chunkIndex, totalChunks, completedChunks, percent }) => {
          const now = Date.now();
          if (now - lastProgressUpdateRef.current < 500 && percent < 100) return;
          lastProgressUpdateRef.current = now;
          
          const uploadedBytes = completedChunks * chunkSize;
          const elapsedSeconds = (now - startTime) / 1000;
          const speed = uploadedBytes / 1024 / 1024 / (elapsedSeconds || 1);
          const remainingBytes = file.size - uploadedBytes;
          const etaSeconds = remainingBytes / (speed * 1024 * 1024);
          
          setUploadProgress(percent);
          setUploadedBytes(uploadedBytes);
          setUploadSpeed(speed);
          
          if (etaSeconds < 60) setUploadETA(`${Math.round(etaSeconds)}s`);
          else if (etaSeconds < 3600) setUploadETA(`${Math.round(etaSeconds / 60)}m`);
          else setUploadETA(`${Math.round(etaSeconds / 3600)}h`);
          
          saveChunkUploadState(uploadId, {
            uploadId,
            fileName: file.name,
            fileSize: file.size,
            totalChunks: chunks.length,
            uploadedChunks: Array.from({ length: completedChunks }, (_, i) => i),
            sessionId,
            roomId,
            progress: percent
          });
        }
      });
      
      console.log('✅ [Chunked Upload] Complete');
      setUploadProgress(100);
      clearChunkUploadState(uploadId);
      localStorage.removeItem('current_upload_id');
      
      // Notify Service Worker of completion
      if (uploadSW.isRegistered) {
        uploadSW.notifyUploadCompleted({
          uploadId,
          fileName: file.name,
          roomId
        });
      }

      // ✅ RETRY POSTER: Poster generates async on backend (takes ~500ms)
      // If we get placeholder poster, retry fetching after 1.5s to get real poster
      setTimeout(async () => {
        try {
          console.log('🎨 [Poster Retry] Fetching updated media items for poster...');
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/temporary-media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('🎨 [Poster Retry] Received updated media items:', data);
            
            // Trigger parent to refresh playlist with updated posters
            if (onUploadComplete) {
              onUploadComplete();
            }
          }
        } catch (err) {
          console.warn('⚠️ [Poster Retry] Failed to fetch updated poster:', err);
        }
      }, 1500); // Wait 1.5s for async poster generation

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.message?.includes('cancel')) {
        console.log('🚫 [Upload] Cancelled');
        clearChunkUploadState(uploadId);
        localStorage.removeItem('current_upload_id');
        alert("Upload cancelled.");
      } else {
        console.error("❌ [Upload] Failed:", err);
        clearChunkUploadState(uploadId);
        localStorage.removeItem('current_upload_id');
        alert(`Upload failed: ${err.message}`);
      }
    } finally {
      localStorage.removeItem('wewatch_active_upload');
      localStorage.removeItem('current_upload_id');
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed(0);
      setUploadETA('');
      setUploadedBytes(0);
      setTotalBytes(0);
      uploadAbortControllerRef.current = null;
    }
  };

  const handleFileUpload = async (files) => {
    if (!files?.length || !roomId) return;
    
    const file = files[0];
    
    // ✅ CLIENT-SIDE VALIDATION
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/avi', 'video/x-msvideo'];
    if (!allowedTypes.includes(file.type)) {
      alert(`Invalid file type: ${file.type}\\n\\nAllowed types: MP4, WebM, MOV, MKV, AVI`);
      return;
    }
    
    const maxSize = 1 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File too large: ${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB\\n\\nMaximum: 1 GB`);
      return;
    }
    
    if (file.size < 1024) {
      alert('File too small. Please select a valid video file.');
      return;
    }
    
    console.log('✅ [Validation] Passed:', {
      name: file.name,
      type: file.type,
      size: formatFileSize(file.size)
    });
    
    if (!hasAcceptedTerms) {
      setShowUploadDisclaimer(true);
      return;
    }
    
    // ✅ START UPLOAD DIRECTLY (no compression)
    await uploadFileChunked(file);
  };

  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      console.log('🚫 [LeftSidebar] Upload cancel requested');
    }
    
    // Clear persistence timer
    if (progressPersistenceTimerRef.current) {
      clearInterval(progressPersistenceTimerRef.current);
      progressPersistenceTimerRef.current = null;
    }
    
    // Clear any saved upload state
    const uploads = Object.keys(localStorage).filter(key => key.startsWith('wewatch_chunk_upload_'));
    uploads.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('wewatch_active_upload');
  };
  
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); };

  // 🔗 Validate and stream from URL
  const validateStreamUrl = (url) => {
    console.log('🔗 [validateStreamUrl] Validating URL:', url);
    
    if (!url) {
      console.log('❌ [validateStreamUrl] Empty URL');
      return { valid: false, error: 'Please enter a URL' };
    }
    
    // Check if it's a valid URL
    try {
      new URL(url);
    } catch (e) {
      console.log('❌ [validateStreamUrl] Invalid URL format:', e.message);
      return { valid: false, error: 'Invalid URL format' };
    }
    
    const urlLower = url.toLowerCase();
    
    // ❌ Reject cloud storage providers (CORS/403 issues - use "Watch From" tab instead)
    const cloudProviders = [
      { domain: 'drive.google.com', name: 'Google Drive' },
      { domain: 'dropbox.com', name: 'Dropbox' },
      { domain: 'onedrive.live.com', name: 'OneDrive' },
      { domain: '1drv.ms', name: 'OneDrive' }
    ];
    
    for (const provider of cloudProviders) {
      if (urlLower.includes(provider.domain)) {
        console.log('❌ [validateStreamUrl] Cloud storage URL rejected:', provider.name);
        return { 
          valid: false, 
          error: `${provider.name} links can't be streamed due to CORS restrictions. Use "Watch From" tab to screen share instead!` 
        };
      }
    }
    
    // For direct URLs, check for video file extensions
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.m3u8', '.avi', '.mkv', '.flv', '.wmv', '.m4v'];
    const hasVideoExtension = videoExtensions.some(ext => urlLower.includes(ext));
    
    if (!hasVideoExtension) {
      console.log('❌ [validateStreamUrl] No video extension found in URL');
      return { valid: false, error: 'URL must point to a direct video file (.mp4, .webm, .m3u8, etc.)' };
    }
    
    console.log('✅ [validateStreamUrl] Valid video URL');
    return { valid: true };
  };

  const handleStreamFromUrl = async () => {
    if (!streamUrl.trim()) {
      setUrlError('Please enter a video URL');
      return;
    }
    
    // Check if user has accepted terms
    if (!hasAcceptedTerms) {
      setShowUploadDisclaimer(true);
      return;
    }
    
    const validation = validateStreamUrl(streamUrl);
    if (!validation.valid) {
      setUrlError(validation.error);
      return;
    }
    
    setIsValidatingUrl(true);
    setUrlError(null);
    
    try {
      // Add stream URL to playlist via API
      const response = await apiClient.post(`/api/rooms/${roomId}/media/stream`, {
        stream_url: streamUrl.trim(),
        session_id: sessionId
      });
      
      console.log('🔗 [LeftSidebar] Stream URL added:', response.data);
      
      // Clear input
      setStreamUrl('');
      
      // Refresh playlist
      if (onUploadComplete) {
        onUploadComplete();
      }
      
      alert('Stream URL added to playlist!');
    } catch (err) {
      console.error('❌ [LeftSidebar] Stream URL failed:', err);
      
      if (err.response?.status === 400) {
        setUrlError(err.response.data.error || 'Invalid stream URL');
      } else if (err.response?.status === 403) {
        setUrlError('URL is not accessible or requires authentication');
      } else {
        setUrlError('Failed to add stream URL. Would you like to upload the file instead?');
        
        // Offer fallback after 3 seconds
        setTimeout(() => {
          if (confirm('Stream URL failed. Upload the file from your device instead?')) {
            fileInputRef.current?.click();
          }
        }, 2000);
      }
    } finally {
      setIsValidatingUrl(false);
    }
  };

  // 🎓 Educational platforms for Lecture Halls
  const educationalPlatforms = [
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
    { id: 'khanacademy', name: 'Khan Academy', url: 'https://www.khanacademy.org' },
    { id: 'coursera', name: 'Coursera', url: 'https://www.coursera.org' },
    { id: 'edx', name: 'edX', url: 'https://www.edx.org' },
    { id: 'udemy', name: 'Udemy', url: 'https://www.udemy.com' },
    { id: 'linkedin', name: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning' },
    { id: 'skillshare', name: 'Skillshare', url: 'https://www.skillshare.com' },
    { id: 'ted', name: 'TED', url: 'https://www.ted.com' },
    { id: 'vimeo', name: 'Vimeo', url: 'https://www.vimeo.com' },
    { id: 'dailymotion', name: 'Dailymotion', url: 'https://www.dailymotion.com' },
    { id: 'mitocw', name: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu' },
    { id: 'stanford', name: 'Stanford Online', url: 'https://online.stanford.edu' },
    { id: 'futurelearn', name: 'FutureLearn', url: 'https://www.futurelearn.com' },
    { id: 'udacity', name: 'Udacity', url: 'https://www.udacity.com' },
    { id: 'pluralsight', name: 'Pluralsight', url: 'https://www.pluralsight.com' },
  ];

  // 🙏 Religious platforms for Church/Religious content
  const religiousPlatforms = [
    // Video Streaming (Primary)
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
    
    // Nigerian Churches (Free Live Streaming)
    { id: 'christembassy', name: 'Christ Embassy', url: 'https://christembassy.org/live' },
    { id: 'rccg', name: 'RCCG', url: 'https://rccg.org' },
    { id: 'winnerschapel', name: 'Winners Chapel', url: 'https://www.davidoyedepoministries.org' },
    { id: 'deeperlife', name: 'Deeper Life Bible Church', url: 'https://www.deeperlife.org' },
    { id: 'mfm', name: 'Mountain of Fire', url: 'https://mountainoffire.org' },
    { id: 'dunamis', name: 'Dunamis International', url: 'https://dunamisgospel.org' },
    { id: 'hotr', name: 'House on the Rock', url: 'https://www.hotr.org.ng' },
    { id: 'daystarng', name: 'Daystar Christian Centre', url: 'https://daystarng.org' },
    { id: 'covenantnation', name: 'Covenant Nation', url: 'https://thecovenantnation.com' },
    { id: 'elevationng', name: 'Elevation Church', url: 'https://elevationchurch.tv' },
    
    // International Christian Broadcasting Networks
    { id: 'tbn', name: 'TBN', url: 'https://watch.tbn.org' },
    { id: 'daystar', name: 'Daystar', url: 'https://www.daystar.com/live' },
    { id: 'godtv', name: 'GOD TV', url: 'https://god.tv' },
    { id: 'cbn', name: 'CBN', url: 'https://www1.cbn.com/cbnnews/live' },
    { id: 'ewtn', name: 'EWTN', url: 'https://www.ewtn.com/live' },
    { id: 'vatican', name: 'Vatican Media', url: 'https://www.vaticannews.va/en.html' },
    { id: 'hillsong', name: 'Hillsong Channel', url: 'https://hillsong.com/channel' },
    { id: 'lifechurch', name: 'Life.Church', url: 'https://live.life.church' },
    
    // Sermon & Teaching Platforms
    { id: 'sermonaudio', name: 'SermonAudio', url: 'https://www.sermonaudio.com' },
    { id: 'preachtheword', name: 'Preach the Word', url: 'https://www.preachtheword.com' },
  ];

  // 🎬 Entertainment platforms for Cinemas & Video Watch (Screen-share friendly, no DRM)
  const entertainmentPlatforms = [
    // Video Streaming (Legal, No DRM)
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
    { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv' },
    { id: 'vimeo', name: 'Vimeo', url: 'https://vimeo.com' },
    { id: 'dailymotion', name: 'Dailymotion', url: 'https://www.dailymotion.com' },
    { id: 'kick', name: 'Kick', url: 'https://kick.com' },
    { id: 'rumble', name: 'Rumble', url: 'https://rumble.com' },
    
    // Free Streaming Services (Legal, Ad-Supported, Screen-share friendly)
    { id: 'tubi', name: 'Tubi', url: 'https://tubitv.com' },
    { id: 'crackle', name: 'Crackle', url: 'https://www.crackle.com' },
    { id: 'xumo', name: 'Xumo Play', url: 'https://www.xumo.com' },
    
    // Anime & Animation (Free tiers, screen-share friendly)
    { id: 'retrocrush', name: 'RetroCrush', url: 'https://www.retrocrush.tv' },
    
    // Sports & Live Events (Free tiers)
    { id: 'redbulltv', name: 'Red Bull TV', url: 'https://www.redbull.com/int-en/tv' },
    { id: 'caffeine', name: 'Caffeine', url: 'https://www.caffeine.tv' },
    
    // Reading & Comics (Legal)
    { id: 'webtoon', name: 'Webtoon', url: 'https://www.webtoons.com' },
    { id: 'wattpad', name: 'Wattpad', url: 'https://www.wattpad.com' },
    { id: 'mangaplus', name: 'MangaPlus', url: 'https://mangaplus.shueisha.co.jp' },
    { id: 'comicbookplus', name: 'Comic Book Plus', url: 'https://comicbookplus.com' },
    { id: 'projectgutenberg', name: 'Project Gutenberg', url: 'https://www.gutenberg.org' },
    { id: 'archiveofourown', name: 'Archive of Our Own', url: 'https://archiveofourown.org' },
  ];

  // ✅ Choose platform list based on content rating and watch type
  const isLectureHallContext = watchType === 'classroom' && classType === 'lecture_hall';
  const contentRating = sessionStatus?.content_rating || 'G';
  
  const platforms = 
    contentRating === 'Religious' ? religiousPlatforms :
    (isLectureHallContext || contentRating === 'Educational') ? educationalPlatforms :
    entertainmentPlatforms;

  const filteredPlatforms = platforms.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
  };

  const handleStartPlatformScreenShare = (platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    const platformName = platform?.name || 'External Screen';

    // ✅ Call onStartScreenShare with 'screen' mode and 'watchfrom' source
    if (onStartScreenShare) {
      onStartScreenShare('screen', 'watchfrom');
    }

    if (sendMessage && currentUser) {
      sendMessage({
        type: "update_room_status",
        data: {
          is_screen_sharing: true,
          screen_sharing_user_id: currentUser.id,
          currently_playing: `Watching ${platformName}`,
          coming_next: ""
        }
      });
    }

    setShowWatchFromInstructions(false);
  };
  
  // ✅ Handle ending WatchFrom - clears platform selection
  const handleEndWatchFrom = () => {
    setSelectedPlatform(null);
    if (onEndScreenShare) {
      onEndScreenShare();
    }
  };

  // ✅ Handle title edit start
  const handleEditTitle = () => {
    setTempTitle(sessionTitle);
    setIsEditingTitle(true);
  };

  // ✅ Handle title save
  const handleSaveTitle = () => {
    if (tempTitle.trim()) {
      setSessionTitle(tempTitle.trim());
      
      // Send WebSocket message to update title
      if (sendMessage && sessionId) {
        sendMessage({
          type: 'session_title_update',
          data: {
            session_id: sessionId,
            title: tempTitle.trim()
          }
        });
      }
    }
    setIsEditingTitle(false);
  };

  // ✅ Handle title input key press
  const handleTitleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  // 🖼️ Handle toggle preview thumbnails (content moderation)
  const handleTogglePreviewThumbnails = () => {
    // 🔒 Prevent toggling if session is private OR hidden from lobby (Ghost Mode is enforced)
    const shouldEnforce = isSessionPrivate || sessionStatus?.isPrivate || sessionStatus?.hideFromLobby;
    if (shouldEnforce) {
      console.log('👻 [LeftSidebar] ⛔ Cannot toggle Ghost Mode - session privacy/lobby visibility enforced:', {
        isSessionPrivate,
        sessionIsPrivate: sessionStatus?.isPrivate,
        hideFromLobby: sessionStatus?.hideFromLobby
      });
      return;
    }
    
    const newValue = !hidePreviewThumbnails;
    setHidePreviewThumbnails(newValue);
    
    // Send WebSocket message to backend
    if (sendMessage && sessionId) {
      sendMessage({
        type: 'toggle_preview_generation',
        data: {
          session_id: sessionId,
          enabled: !newValue // Inverted: hide=true means generation=false
        }
      });
      
      console.log('🖼️ [LeftSidebar] Preview generation toggled:', {
        hidePreviewThumbnails: newValue,
        previewGenerationEnabled: !newValue,
        sessionId
      });
    }
  };

  return (
    <div
      ref={sidebarRef}
      className="fixed left-0 top-0 h-full w-full sm:w-[350px] md:w-96 z-40 overflow-y-auto hide-scrollbar left-sidebar pt-16"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ✅ Host Verification Loading Overlay */}
      {isVerifyingHost && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white text-sm font-medium">Verifying host status...</span>
          </div>
        </div>
      )}
      
      {/* 🌙 Host Settings - Darkness Level Control (3D Cinema Only) */}
      {isHost && watchType === '3d_cinema' && darknessLevel && onDarknessLevelChange && (
        <div className="mb-3 p-3 sm:p-4 bg-[#D9D9D9]/10 rounded-xl">
          <div className="mb-2">
            <span className="text-sm sm:text-base font-medium text-white">
              Darkness Level (Lights Off)
            </span>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 leading-relaxed">
              Adjust cinema darkness when lights are off
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onDarknessLevelChange('regular')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                darknessLevel === 'regular'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
            >
              🌙 Regular
            </button>
            <button
              onClick={() => onDarknessLevelChange('extreme')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                darknessLevel === 'extreme'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
            >
              🌑 Extreme
            </button>
          </div>
        </div>
      )}

      {/* 🖼️ Host Settings - Preview Thumbnails Toggle */}
      {isHost && (
        <div className="mb-3 p-3 sm:p-4 bg-gradient-to-br from-[#D9D9D9]/10 to-[#D9D9D9]/5 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300">
          <style jsx>{`
            @keyframes ghostFloat {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-8px); }
            }
            
            @keyframes ghostEntrance {
              0% {
                opacity: 0;
                transform: translateY(20px) scale(0.8);
              }
              60% {
                transform: translateY(-5px) scale(1.1);
              }
              100% {
                opacity: 1;
                transform: translateY(0px) scale(1);
              }
            }
            
            @keyframes ghostGlow {
              0%, 100% { filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.4)); }
              50% { filter: drop-shadow(0 0 16px rgba(168, 85, 247, 0.7)); }
            }
            
            .ghost-float {
              animation: ghostFloat 3s ease-in-out infinite;
            }
            
            .ghost-entrance {
              animation: ghostEntrance 0.6s ease-out forwards;
            }
            
            .ghost-glow {
              animation: ghostGlow 2s ease-in-out infinite;
            }
            
            .ghost-icon {
              font-size: 2.5rem;
              line-height: 1;
              filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.4));
            }
            
            @media (min-width: 640px) {
              .ghost-icon {
                font-size: 3rem;
              }
            }
          `}</style>
          
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={hidePreviewThumbnails}
              onChange={handleTogglePreviewThumbnails}
              disabled={isSessionPrivate || sessionStatus?.isPrivate || sessionStatus?.hideFromLobby}
              className="mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-600 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0 focus:ring-offset-transparent bg-gray-700 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-2">
              <span 
                className="ghost-icon ghost-float ghost-entrance ghost-glow group-hover:scale-110 transition-transform duration-300" 
                role="img" 
                aria-label="ghost"
                style={{ 
                  textShadow: '0 0 20px rgba(168, 85, 247, 0.6), 0 0 40px rgba(168, 85, 247, 0.3)',
                  WebkitTextStroke: '0.5px rgba(168, 85, 247, 0.3)'
                }}
              >
                👻
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 group-hover:from-purple-300 group-hover:via-pink-300 group-hover:to-purple-300 transition-all duration-300">
                  Ghost Mode
                </span>
                {hidePreviewThumbnails && !(isSessionPrivate || sessionStatus?.isPrivate || sessionStatus?.hideFromLobby) && (
                  <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 animate-pulse">
                    ACTIVE
                  </span>
                )}
                {(isSessionPrivate || sessionStatus?.isPrivate || sessionStatus?.hideFromLobby) && (
                  <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold bg-yellow-500/20 text-yellow-300 rounded-full border border-yellow-500/30">
                    ENFORCED
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-xs text-gray-400 mt-1 leading-relaxed group-hover:text-gray-300 transition-colors">
                {(isSessionPrivate || sessionStatus?.isPrivate || sessionStatus?.hideFromLobby)
                  ? '🔒 Hidden from lobby - Session created as private'
                  : '🔒 Content moderation - Hide from public view. Use for sensitive or private content.'}
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="p-2 sm:p-3 bg-[#D9D9D9]/10 rounded-xl">
        <div className="flex gap-1 sm:gap-2">
          {availableTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 h-[40px] sm:h-[43px] flex items-center justify-center transition-colors px-2 ${
                activeTab === tab
                  ? 'text-white font-bold text-base sm:text-base md:text-[17px] bg-[#D9D9D9]/25 rounded-full'
                  : 'text-gray-400 font-normal text-sm sm:text-sm md:text-[15px] hover:text-white'
              }`}
            >
              {tab === 'upload' && <span className="truncate">Upload</span>}
              {tab === 'liveshare' && <span className="truncate">LiveShare</span>}
              {tab === 'watchfrom' && <span className="truncate">Watch From</span>}
            </button>
          ))}
        </div>
      </div>

      {/* UPLOAD TAB — visible to all */}
      {activeTab === 'upload' && (
        <div className="flex flex-col h-full">
          {/* Upload Section - Host Only */}
          {isHost && (
            <div className="p-3 sm:p-4 bg-[#D9D9D9]/10 rounded-b-2xl rounded-t-none mb-3 sm:mb-4 flex flex-col">
              <div className="flex items-center mb-3">
                <img src="/icons/UploadIcon.svg" alt="Upload" className="h-10 w-8 sm:h-14 sm:w-12 mr-2 sm:mr-3" />
                <span className="text-base sm:text-lg md:text-[20px] font-medium text-white">Upload to Playlist</span>
              </div>
              <div
                className="bg-black p-3 sm:p-4 rounded-lg flex-1 flex flex-col justify-center"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex items-center mb-2 sm:mb-3">
                  <img src="/icons/FilesIcon.svg" alt="Files" className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  <span className="text-[10px] sm:text-xs text-gray-500">Choose a file or drag & drop</span>
                </div>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      if (!hasAcceptedTerms) {
                        setShowUploadDisclaimer(true);
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    disabled={uploading}
                    className="flex-1 px-3 sm:px-4 py-2 bg-[#444AF7]/20 text-white rounded-full font-medium text-sm sm:text-[15px] hover:bg-[#444AF7]/30 disabled:opacity-50 transition-colors"
                  >
                    {uploading ? 'Uploading...' : 'Browse Files'}
                  </button>
                  <button
                    onClick={() => {
                      // Toggle URL input visibility
                      const urlInput = document.getElementById('stream-url-input');
                      if (urlInput) {
                        urlInput.style.display = urlInput.style.display === 'none' ? 'block' : 'none';
                        if (urlInput.style.display === 'block') {
                          urlInput.focus();
                        }
                      }
                    }}
                    disabled={uploading || isValidatingUrl}
                    className="flex-1 px-3 sm:px-4 py-2 bg-purple-600/20 text-white rounded-full font-medium text-sm sm:text-[15px] hover:bg-purple-600/30 disabled:opacity-50 transition-colors"
                    title="Stream from URL"
                  >
                    🔗 URL
                  </button>
                </div>
                
                {/* URL Input (hidden by default) */}
                <div id="stream-url-input" style={{ display: 'none' }} className="mb-3 space-y-2">
                  <input
                    type="url"
                    value={streamUrl}
                    onChange={(e) => {
                      setStreamUrl(e.target.value);
                      setUrlError(null);
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !isValidatingUrl) {
                        handleStreamFromUrl();
                      }
                    }}
                    placeholder="Paste video URL (mp4, webm, m3u8...)"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-xs placeholder-gray-400 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                  {urlError && (
                    <p className="text-red-400 text-[10px]">{urlError}</p>
                  )}
                  <button
                    onClick={handleStreamFromUrl}
                    disabled={isValidatingUrl || !streamUrl.trim()}
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isValidatingUrl ? 'Validating...' : 'Add to Playlist'}
                  </button>
                  <p className="text-gray-400 text-[9px] leading-tight">
                    💡 Direct video URLs only (.mp4, .webm, .m3u8)
                  </p>
                  <p className="text-blue-400 text-[9px] leading-tight mt-1">
                    📺 For Google Drive/Dropbox: Use "Watch From" tab to screen share
                  </p>
                </div>
                
                {uploading && (
                  <div className="w-full mt-3">
                    {/* Progress bar */}
                    <div className="bg-gray-700 rounded-full h-2 mb-2">
                      <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    
                    {/* Progress details */}
                    <div className="flex justify-between items-center text-xs text-gray-300">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{uploadProgress}%</span>
                        <span className="text-gray-400">•</span>
                        <span>{formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {uploadSpeed > 0 && (
                          <>
                            <span className="text-green-400">{uploadSpeed.toFixed(1)} MB/s</span>
                            <span className="text-gray-400">•</span>
                          </>
                        )}
                        <span className="text-blue-400">{uploadETA}</span>
                      </div>
                    </div>
                    
                    {/* Cancel button */}
                    <button
                      onClick={handleCancelUpload}
                      className="w-full mt-2 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium text-xs transition-colors"
                    >
                      Cancel Upload
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    handleFileUpload(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          )}

          {/* START/END GAME & RECORD & BIBLE & HYMN BUTTONS - Horizontal Layout */}
          {isHost && (() => {
            // ✅ Content rating-based filtering
            const contentRating = sessionStatus?.content_rating || 'G';
            const showGameButton = !['Educational', 'Religious'].includes(contentRating);
            const showReligiousButtons = contentRating === 'Religious';
            
            // 🔍 DEBUG: Log content rating state
            console.log('🔍 [LeftSidebar Buttons] Content Rating Check:', {
              sessionStatus,
              contentRating,
              showGameButton,
              showReligiousButtons,
              sessionStatusExists: !!sessionStatus,
              contentRatingField: sessionStatus?.content_rating
            });
            
            // Check if Quiz button should show (Lecture Hall OR Educational content)
            const showQuizButton = ((watchType === 'classroom' && classType === 'lecture_hall') || contentRating === 'Educational') && onQuizClick;
            
            return (
              <div className="flex justify-around items-center gap-4 mb-3 sm:mb-4 px-2">
                {/* START/END GAME BUTTON (Host Only - Hidden for Educational/Religious) */}
                {showGameButton && (onGameClick || onGameClose) && (
                  <button
                    onClick={() => {
                      if (activeGame) {
                        console.log('🎮 [LeftSidebar] End Game button clicked!');
                        if (onGameClose) {
                          onGameClose();
                          toast.success('Game ended', { icon: '🎮' });
                        }
                      } else {
                        console.log('🎮 [LeftSidebar] Start Game button clicked!');
                        if (onGameClick) {
                          onGameClick();
                        }
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 hover:opacity-70 transition-all group"
                  >
                    {activeGame ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 sm:w-8 sm:h-8 text-red-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-[10px] text-gray-300 font-medium">End Game</span>
                      </>
                    ) : (
                      <>
                        <Gamepad2 className="w-7 h-7 sm:w-8 sm:h-8 text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] text-gray-300 font-medium">Start Game</span>
                      </>
                    )}
                  </button>
                )}
                
                {/* QUIZ BUTTON (Lecture Hall OR Educational Content - Host Only) */}
                {showQuizButton && (
                  <button
                    onClick={onQuizClick}
                    className="flex flex-col items-center gap-1.5 hover:opacity-70 transition-all group"
                  >
                    <img src="/icons/quiz.svg" alt="" className="w-7 h-7 sm:w-8 sm:h-8 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] text-gray-300 font-medium">Quiz</span>
                  </button>
                )}

                {/* RECORD BUTTON (Host Only - All Watch Types) */}
                <button
                  onClick={() => {
                    if (isRecording) {
                      stopRecording();
                    } else {
                      setShowRecordingModal(true);
                    }
                  }}
                  disabled={recordingProcessing}
                  className={`flex flex-col items-center gap-1.5 transition-all group ${
                    recordingProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-70'
                  }`}
                >
                  {recordingProcessing ? (
                    <>
                      <svg className="animate-spin w-7 h-7 sm:w-8 sm:h-8 text-gray-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-[10px] text-gray-300 font-medium">{recordingUploadProgress}%</span>
                    </>
                  ) : isRecording ? (
                    <>
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-[10px] text-gray-300 font-medium">{formatTime(recordingDuration)}</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-7 h-7 sm:w-8 sm:h-8 text-purple-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] text-gray-300 font-medium">Record</span>
                    </>
                  )}
                </button>
                
                {/* BIBLE BUTTON (Religious Content Only) */}
                {showReligiousButtons && (
                  <button
                    onClick={() => {
                      console.log('📖 [LeftSidebar] Bible button clicked!');
                      setShowBibleSelector(true);
                    }}
                    className="flex flex-col items-center gap-1.5 hover:opacity-70 transition-all group"
                  >
                    <BookOpen className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] text-gray-300 font-medium">Bible</span>
                  </button>
                )}
                
                {/* HYMN BUTTON (Religious Content Only) */}
                {showReligiousButtons && (
                  <button
                    onClick={() => {
                      console.log('🎵 [LeftSidebar] Hymn button clicked!');
                      setShowHymnSelector(true);
                    }}
                    className="flex flex-col items-center gap-1.5 hover:opacity-70 transition-all group"
                  >
                    <Music className="w-7 h-7 sm:w-8 sm:h-8 text-green-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] text-gray-300 font-medium">Hymn</span>
                  </button>
                )}
              </div>
            );
          })()}

          <div className="flex-1 mt-3 sm:mt-4 min-h-0">
            <div className="h-full flex flex-col p-3 sm:p-4 bg-[#D9D9D9]/10 rounded-xl overflow-y-auto">

              {/* ACTIVE QUIZZES (Lecture Hall - Students) */}
              {!isHost && watchType === 'classroom' && classType === 'lecture_hall' && onTakeQuiz && (() => {
                // ✅ Get all active quizzes (both from activeQuiz and quizHistory)
                let allActiveQuizzes = [];
                
                // Add activeQuiz if it exists (real-time published quiz)
                if (activeQuiz) {
                  allActiveQuizzes.push(activeQuiz);
                }
                
                // Add quizzes from quiz history (for late joiners)
                if (quizHistory?.active_quizzes?.length > 0) {
                  // Avoid duplicates by checking quiz IDs (normalize quiz_id vs id)
                  quizHistory.active_quizzes.forEach(historyQuiz => {
                    const historyQuizId = historyQuiz.quiz_id || historyQuiz.id;
                    const isDuplicate = allActiveQuizzes.some(q => {
                      const existingQuizId = q.quiz_id || q.id;
                      return existingQuizId === historyQuizId;
                    });
                    if (!isDuplicate) {
                      allActiveQuizzes.push(historyQuiz);
                    }
                  });
                }
                
                if (allActiveQuizzes.length === 0) return null;
                
                // Get list of completed quiz IDs
                const completedQuizIds = quizHistory?.completed_submissions?.map(sub => sub.quiz_id) || [];
                
                return (
                  <div className="space-y-2 mb-3 sm:mb-4">
                    {allActiveQuizzes.map(quiz => {
                      // Normalize quiz ID (could be quiz_id or id)
                      const quizId = quiz.quiz_id || quiz.id;
                      const isCompleted = completedQuizIds.includes(quizId);
                      
                      return (
                        <button
                          key={quizId}
                          onClick={() => !isCompleted && onTakeQuiz(quiz)}
                          disabled={isCompleted}
                          className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg font-semibold text-xs sm:text-sm transition-all shadow-lg ${
                            isCompleted
                              ? 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-60'
                              : 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white animate-pulse'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex-shrink-0">📝</span>
                              <span className="truncate">{quiz.name}</span>
                            </span>
                            {isCompleted && (
                              <span className="flex-shrink-0 px-2 py-0.5 bg-green-600/30 text-green-400 rounded text-[10px] sm:text-xs font-bold border border-green-600/50">
                                ✓ COMPLETED
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              
              <h4 className="text-sm sm:text-base font-semibold text-gray-400 mb-2">PLAYING NOW</h4>
              {currentMedia ? (
                <div className="bg-gray-800 rounded-lg p-2 sm:p-3 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <img
                      src={currentMedia.poster_url || '/icons/placeholder-poster.jpg'}
                      alt={currentMedia.original_name}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate text-xs sm:text-sm">{currentMedia.original_name}</p>
                      <p className="text-gray-400 text-[10px] sm:text-xs">{currentMedia.duration || '00:00'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-xs sm:text-sm">No media playing</p>
              )}

              <h4 className="text-sm sm:text-base font-semibold text-gray-400 mb-2">PLAYLIST</h4>
              {playlist.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar">
                  {playlist.map((item) => (
                    <div
                      key={item.ID}
                      className={`bg-gray-800 rounded-lg p-2 sm:p-3 ${
                        isHost ? 'cursor-pointer hover:bg-gray-700' : 'cursor-not-allowed opacity-60'
                      } transition-colors flex items-center gap-2 sm:gap-3`}
                      onClick={() => {
                        if (isHost) {
                          onMediaSelect({ ...item, type: 'upload' });
                          
                          // Send WebSocket message for lecture hall/classroom blackboard display
                          if ((watchType === 'classroom' || classType === 'lecture_hall') && sendMessage) {
                            // ✅ Construct absolute URL for WebSocket broadcast
                            let fileUrl = item.file_path || item.file_url;
                            if (fileUrl && !fileUrl.startsWith('http')) {
                              const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
                              fileUrl = `${API_BASE_URL}/${fileUrl}`;
                            }
                            
                            sendMessage({
                              type: 'media_play',
                              data: {
                                media_id: item.id,
                                url: fileUrl, // ✅ Now absolute URL
                                type: item.mime_type || item.media_type || 'video/mp4',
                                title: item.original_name,
                                timestamp: 0
                              }
                            });
                          }
                        }
                      }}
                      title={!isHost ? "Only the host can play media" : ""}
                    >
                      <img
                        src={item.poster_url || '/icons/placeholder-poster.jpg'}
                        onError={(e) => e.target.src = '/icons/placeholder-poster.jpg'}
                        alt={item.original_name}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs sm:text-sm font-medium truncate">{item.original_name}</p>
                        <p className="text-gray-400 text-[10px] sm:text-xs">{item.duration}</p>
                      </div>
                      {isHost && (() => {
                        const savedState = getSavedResumeState(item);
                        return (
                          <div className="flex items-center gap-1">
                            {savedState && savedState.currentTime > 0 && (
                              <button
                                className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 rounded"
                                title={`Resume from ${Math.floor(savedState.currentTime)}s`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onResumeMedia) {
                                    onResumeMedia(item, savedState.currentTime);
                                  }
                                }}
                              >
                                Resume
                              </button>
                            )}
                            <button
                              className="text-red-400 hover:text-red-600"
                              title="Delete media"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Delete this media file?")) {
                                  onDeleteMedia(item);
                                }
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No media uploaded</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LIVESHARE TAB */}
      {activeTab === 'liveshare' && (
        <div className="p-4 space-y-4">
          <LiveShareManager
            sessionId={sessionId}
            watchSessionMembers={watchSessionMembers}
            currentUser={currentUser}
            isHost={isHost}
            watchType={watchType}
            liveShareMode={liveShareMode}
            liveShareContentMode={liveShareContentMode}
            liveShareGuest={liveShareGuest}
            hasLiveSharePermission={hasLiveSharePermission}
            onLiveShareModeSelect={onLiveShareModeSelect}
            onLiveShareTypeSelect={onLiveShareTypeSelect}
            onGrantLiveSharePermission={onGrantLiveSharePermission}
            onRevokeLiveSharePermission={onRevokeLiveSharePermission}
            onKickLiveShareGuest={onKickLiveShareGuest}
            onStartScreenShare={onStartScreenShare}
            onCameraPreview={onCameraPreview}
            sendMessage={sendMessage}
            cameraShareTrackRef={cameraShareTrackRef}
            graphicsRendererRef={graphicsRendererRef}
            onWizardStateChange={onWizardStateChange} // ✅ Pass through to LiveShareManager
          />
        </div>
      )}

      {/* WATCH FROM TAB — host only */}
      {activeTab === 'watchfrom' && isHost && (
        <div className="p-3 sm:p-4 h-full flex flex-col">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Watch From Platform</h3>
          
          {/* Legal Notice */}
          <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-blue-300 text-[10px] leading-relaxed">
              📺 Screen share from legal platforms. You must have a valid account. LetsWatchOut doesn't host content.
            </p>
          </div>

          {/* ✅ Show End Watch button if WatchFrom is active */}
          {isScreenSharingActive && sharingSource === 'watchfrom' && (
            <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-red-500/20 rounded-lg border border-red-500/50">
              <p className="text-white text-xs sm:text-sm mb-2 sm:mb-3 text-center">
                Screen sharing active
              </p>
              <button
                onClick={handleEndWatchFrom}
                className="w-full py-2 px-3 sm:px-4 rounded-lg font-medium text-xs sm:text-sm transition-colors bg-red-500 hover:bg-red-600 text-white"
              >
                ✕ End Watch
              </button>
            </div>
          )}

          {/* ✅ Session Title Editor */}
          <div className="bg-[#D9D9D9]/20 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white text-sm sm:text-base font-semibold">Session Title</span>
            </div>
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <>
                  <input
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    onKeyDown={handleTitleKeyPress}
                    placeholder="Title of this watch session"
                    className="flex-1 px-3 py-2.5 bg-gray-800 text-white rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-2.5 bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
                    title="Save title"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 px-3 py-2.5 bg-gray-800 text-white rounded-lg text-sm sm:text-base min-h-[38px] sm:min-h-[42px] flex items-center">
                    {sessionTitle || (
                      <span className="text-gray-500 truncate">
                        Title of this watch session
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleEditTitle}
                    className="p-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                    title="Edit title"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (!searchQuery.trim()) return;
            const matched = platforms.find(p => p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));
            const url = matched ? matched.url : `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
            window.open(url, '_blank');
            setSearchQuery('');
          }} className="mb-3 sm:mb-4">
            <input
              type="text"
              placeholder="Search platforms or browse the web..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 sm:px-4 py-2 text-white text-xs sm:text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button type="submit" className="mt-3 w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-lg text-base sm:text-lg font-semibold flex items-center justify-center gap-2">
              <span>Go</span>
              <span className="text-xl">→</span>
            </button>
          </form>

          <div className="mt-3 sm:mt-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4">
              {filteredPlatforms.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => {
                    window.open(platform.url, '_blank');
                    setSelectedPlatform(platform.id);
                    setShowWatchFromInstructions(true);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all bg-gray-800/40 hover:bg-gray-700/60 border ${
                    selectedPlatform === platform.id ? 'border-purple-500' : 'border-gray-700'
                  }`}
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${platform.url}&sz=64`}
                    alt={`${platform.name} favicon`}
                    className="w-12 h-12 object-contain mb-2"
                    onError={(e) => e.target.src = `/icons/${platform.id}Icon.svg`}
                  />
                  <span className="text-xs text-white text-center">{platform.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Watch From Instructions — host only */}
      {showWatchFromInstructions && isHost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-3">
              Watch Together
            </h3>
            <p className="text-gray-700 mb-4 text-sm">
              1. Make sure the platform is open in a browser tab<br/>
              2. Click <strong>“Share Screen”</strong> below<br/>
              3. In the popup, select the correct tab or window
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowWatchFromInstructions(false)}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStartPlatformScreenShare(selectedPlatform)}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded"
              >
                🎥 Share Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Upload Copyright Disclaimer */}
      {showUploadDisclaimer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowUploadDisclaimer(false)}>
          <div className="bg-gray-900 border-2 border-red-500 rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-white">
                Copyright Notice
              </h3>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
              <p className="text-gray-300 text-sm mb-3">
                By uploading content to LetsWatchOut, you agree that:
              </p>
              <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
                <li>You own the rights to this content OR have permission to share it</li>
                <li>You will NOT upload copyrighted movies, TV shows, or other protected content</li>
                <li>You are responsible for any copyright violations</li>
                <li>LetsWatchOut may remove content that violates copyright laws</li>
                <li>Repeated violations may result in account suspension</li>
              </ul>
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-xs">
                  <strong>⚡ Recommended:</strong> For copyrighted content (movies, shows), use the <strong>"Watch From"</strong> or <strong>"LiveShare"</strong> tabs to screen share from legal platforms (Netflix, YouTube, etc.) instead of uploading.
                </p>
              </div>
              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-400 text-xs">
                  <strong>📝 File Limit:</strong> 500MB max (encourages personal videos, clips, presentations)
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowUploadDisclaimer(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setHasAcceptedTerms(true);
                  localStorage.setItem('wewatch_upload_terms_accepted', 'true');
                  setShowUploadDisclaimer(false);
                  // Trigger file picker after accepting
                  fileInputRef.current?.click();
                }}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-medium transition-colors"
              >
                ✓ I Understand
              </button>
            </div>
            
            <p className="text-gray-500 text-xs text-center mt-3">
              This acceptance will be remembered for this browser
            </p>
          </div>
        </div>
      )}

      {/* 🔄 Resume Upload Modal */}
      {showResumeUpload && pendingResumeData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Resume Upload?</h3>
            <p className="text-gray-300 mb-2">
              You have an incomplete upload:
            </p>
            <p className="text-white font-semibold mb-4">
              {pendingResumeData.fileName}
            </p>
            <div className="mb-4 bg-gray-700 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Progress:</span>
                <span className="text-white">
                  {Math.round(((pendingResumeData.uploadedChunks?.length || 0) / pendingResumeData.totalChunks) * 100)}%
                </span>
              </div>
              <div className="bg-gray-600 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full"
                  style={{ 
                    width: `${((pendingResumeData.uploadedChunks?.length || 0) / pendingResumeData.totalChunks) * 100}%` 
                  }}
                />
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              Would you like to continue where you left off?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const uploadId = localStorage.getItem('current_upload_id');
                  if (uploadId) {
                    clearChunkUploadState(uploadId);
                    localStorage.removeItem('current_upload_id');
                  }
                  setShowResumeUpload(false);
                  setPendingResumeData(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => {
                  setShowResumeUpload(false);
                  alert('Resume functionality requires re-selecting the file. Please use the upload button and select the same file.');
                  // Note: We can't resume without the user re-selecting the file
                  // because we don't have access to the File object
                }}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-semibold"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End of modals */}

      {/* 🔴 Recording Options Modal */}
      <RecordingOptionsModal
        isOpen={showRecordingModal}
        onClose={() => setShowRecordingModal(false)}
        onStartRecording={(source) => {
          startRecording(source, roomId);
        }}
        roomId={roomId}
      />
      
      {/* 📖 Bible Verse Selector Modal (Religious Content) */}
      {showBibleSelector && (
        <BibleControl
          onShowVerse={(verse) => {
            console.log('📖 [LeftSidebar] Bible verse selected:', verse);
            if (sendMessage) {
              sendMessage({
                type: 'bible_verse_update',
                data: { verse, active: true }
              });
            }
            setShowBibleSelector(false);
            toast.success('Bible verse displayed', { icon: '📖' });
          }}
          onHideVerse={() => {
            setShowBibleSelector(false);
          }}
          currentVerse={null}
        />
      )}
      
      {/* 🎵 Hymn Selector Modal (Religious Content) */}
      {showHymnSelector && (
        <HymnsControl
          onShowHymn={(hymn) => {
            console.log('🎵 [LeftSidebar] Hymn selected:', hymn);
            if (sendMessage) {
              sendMessage({
                type: 'hymn_update',
                data: { hymn, verse: 1, active: true }
              });
            }
            setShowHymnSelector(false);
            toast.success('Hymn displayed', { icon: '🎵' });
          }}
          onHideHymn={() => {
            setShowHymnSelector(false);
          }}
          currentHymn={null}
          currentVerse={1}
        />
      )}
    </div>
  );
}