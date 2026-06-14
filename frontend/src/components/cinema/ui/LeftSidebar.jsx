// src/components/cinema/ui/LeftSidebar.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadMediaToRoom, uploadChunk, uploadFileToBunnyCDN, assembleUpload, apiClient, API_BASE_URL } from '../../../services/api';
import { Gamepad2, Video, BookOpen, Music, FileText } from 'lucide-react'; // Game, Video, Bible, Hymn, Sermon icons
import toast from 'react-hot-toast';
import BibleControl from '../../liveshare/BibleControl';
import HymnsControl from '../../liveshare/HymnsControl';
import SermonControl from '../../liveshare/SermonControl';
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
import ReportModal from '../../ReportModal';
import { extractYouTubeVideoId } from '../YouTubePlayer';

const playSuccess = () => new Audio('/sounds/success.mp3').play().catch(() => {});

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
  podcastConfig = null, // { title, logoUrl, titleStyle, logoStyle, guestUserId, hostUsername }
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
  availableCameras = [], // 📹 Available camera devices
  selectedCameraId = null, // 📹 Currently selected camera
  onCameraSwitch = null, // 📹 Callback to switch camera
  autoOpenGuestInvite = null, // Auto-trigger guest popup
  onGuestInviteConsumed = null, // Clear auto-trigger in parent
  onPlayYouTube = null, // Play YouTube video via legal iframe API (host only)
}) {
  // Host status is authoritative from the parent (derived from room.host_id === currentUser.id).
  // No need to re-verify via API on every sidebar open — host doesn't change during a session.
  const isHost = isHostProp;
  
  // Dynamically determine available tabs
  // ✅ Host sees all tabs; Members see 'upload' + 'liveshare' (if permission granted)
  const availableTabs = isHost 
    ? ['upload', 'liveshare', 'watchfrom'] 
    : hasLiveSharePermission 
      ? ['upload', 'liveshare'] 
      : ['upload'];
  
  // Capture intended tab BEFORE useState can overwrite sessionStorage.
  // On refresh, availableTabs starts as ['upload'] (isHost not yet known), so
  // getInitialTab() would fall back to 'upload' and immediately save it —
  // losing the user's original tab (e.g. 'liveshare'). This ref preserves it.
  const intendedTabRef = useRef(sessionStorage.getItem('wewatch_active_sidebar_tab'));

  const getInitialTab = () => {
    const savedTab = intendedTabRef.current;
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

  // When availableTabs expands (isHost resolved after WS connects), restore the
  // intended tab if it is now valid and the user hasn't manually navigated away.
  useEffect(() => {
    const intended = intendedTabRef.current;
    if (intended && availableTabs.includes(intended) && intended !== activeTab) {
      setActiveTab(intended);
    }
  }, [availableTabs]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [ytUrl, setYtUrl]         = useState('');  // YouTube URL input in Watch From tab
  const [ytError, setYtError]     = useState('');
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);
  const [urlError, setUrlError] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [urlInputFocused, setUrlInputFocused] = useState(false);
  const sidebarRef = useRef(null);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState('');
  const currentPreviewStreamRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false); // same-session pause on network drop
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0); // MB/s
  const [uploadETA, setUploadETA] = useState(''); // Estimated time remaining
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const uploadAbortControllerRef = useRef(null);
  const uploadStartTimeRef = useRef(null);
  const lastProgressUpdateRef = useRef(0); // Throttle progress updates
  const progressPersistenceTimerRef = useRef(null); // Save progress every 5s
  // Refs for same-session auto-retry — always current, no stale-closure risk.
  const uploadFileRef = useRef(null);        // the live File object for the current upload
  const uploadPausedRef = useRef(false);     // mirrors uploadPaused without closure staleness
  const visibilityPauseRef = useRef(false);  // true when upload was paused by a tab switch (not user cancel)
  const uploadFileDirectRef = useRef(null);  // always points at the latest uploadFileDirect fn
  const posterPollTimerRef = useRef(null);   // cleanup handle for poster polling
  
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
  const [showReportModal,    setShowReportModal]    = useState(false);
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
  
  // 📖 Bible, Hymn & Sermon state (Religious content)
  const [showBibleSelector, setShowBibleSelector] = useState(false);
  const [showHymnSelector, setShowHymnSelector] = useState(false);
  const [showSermonSelector, setShowSermonSelector] = useState(false);
  
  // Check for incomplete uploads on mount (dev chunked path + production BunnyCDN path).
  useEffect(() => {
    // Dev path: chunks sent directly to Railway
    const uploadId = localStorage.getItem('current_upload_id');
    if (uploadId) {
      const stateStr = localStorage.getItem(`upload_chunks_${uploadId}`);
      if (!stateStr) {
        localStorage.removeItem('current_upload_id');
      } else {
        const state = JSON.parse(stateStr);
        const uploadedChunks = state.uploadedChunks || [];
        const remaining = state.totalChunks - uploadedChunks.length;
        if (remaining > 0) {
          console.log('📋 [Resume] Found incomplete dev upload:', {
            uploadId,
            fileName: state.fileName,
            progress: Math.round((uploadedChunks.length / state.totalChunks) * 100),
            remainingChunks: remaining,
          });
          setPendingResumeData({ ...state, uploadPath: 'dev' });
          setShowResumeUpload(true);
          return; // only show one resume prompt at a time
        } else {
          clearChunkUploadState(uploadId);
          localStorage.removeItem('current_upload_id');
        }
      }
    }

    // Production path: chunks go to BunnyCDN via Vercel edge function
    const bunnyId = localStorage.getItem('current_bunny_upload_id');
    if (!bunnyId) return;
    const bunnyStr = localStorage.getItem(`wewatch_bunny_upload_${bunnyId}`);
    if (!bunnyStr) {
      localStorage.removeItem('current_bunny_upload_id');
      return;
    }
    try {
      const state = JSON.parse(bunnyStr);
      const completed = state.completedChunks?.length ?? 0;
      const total = state.totalChunks ?? Math.ceil(state.fileSize / (state.chunkSize || 1));
      console.log('📋 [Resume] Found incomplete BunnyCDN upload:', {
        uploadId: bunnyId,
        fileName: state.fileName,
        progress: Math.round((completed / total) * 100),
        needsAssembly: state.needsAssembly ?? false,
      });
      setPendingResumeData({ ...state, uploadPath: 'bunny' });
      setShowResumeUpload(true);
    } catch (_) {
      localStorage.removeItem(`wewatch_bunny_upload_${bunnyId}`);
      localStorage.removeItem('current_bunny_upload_id');
    }
  }, []);
  
  // Detect network quality on mount
  useEffect(() => {
    const detectNetworkQuality = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (!connection) {
        // Network Information API unavailable (iOS Safari, Firefox).
        // Use onLine as a binary fallback — offline = treat as 2G, online = unknown/conservative.
        setNetworkQuality(navigator.onLine === false ? '2g' : 'unknown');
        return;
      }
      
      const effectiveType = connection.effectiveType; // '2g', '3g', '4g', 'slow-2g'

      if (effectiveType === 'slow-2g' || effectiveType === '2g') {
        setNetworkQuality('2g');
      } else if (effectiveType === '3g') {
        setNetworkQuality('3g');
      } else if (effectiveType === '4g') {
        setNetworkQuality('4g');
      } else {
        setNetworkQuality('wifi');
      }
    };
    
    detectNetworkQuality();
    
    // Listen for connection changes (Network Information API — Chrome/Android)
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      connection.addEventListener('change', detectNetworkQuality);
    }

    // Fallback for iOS Safari / Firefox: online/offline events are universally supported
    const handleOffline = () => setNetworkQuality('2g');
    const handleOnline = () => detectNetworkQuality();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      if (connection) connection.removeEventListener('change', detectNetworkQuality);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
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


  // Same-session auto-retry: resumes on network restore OR when the tab becomes visible again
  // after a background pause. Both paths share the same resume() helper.
  // Uses refs so handlers are registered once and never go stale.
  useEffect(() => {
    const resume = () => {
      const bunnyId = localStorage.getItem('current_bunny_upload_id');
      let savedState = null;
      if (bunnyId) {
        try {
          savedState = JSON.parse(localStorage.getItem(`wewatch_bunny_upload_${bunnyId}`) || 'null');
        } catch (_) {}
      }
      uploadFileDirectRef.current?.(uploadFileRef.current, savedState);
    };

    const handleOnline = () => {
      if (!uploadPausedRef.current || !uploadFileRef.current) return;
      console.log('🔄 [AutoRetry] Connection restored — resuming upload automatically…');
      toast('Connection restored — resuming upload…', { icon: '📶' });
      resume();
    };

    // Pause when the user switches tabs; resume instantly when they return.
    // This mirrors Capacitor's appStateChange suspend lifecycle for browser PWA.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!uploadFileRef.current) return; // nothing uploading
        visibilityPauseRef.current = true;
        uploadAbortControllerRef.current?.abort(); // frees mobile network resources while hidden
      } else {
        if (!visibilityPauseRef.current || !uploadFileRef.current) return;
        visibilityPauseRef.current = false;
        console.log('🔄 [VisibilityResume] Tab visible again — resuming upload…');
        resume();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // empty deps — refs handle staleness

  // Cancel any in-flight poster poll when the sidebar unmounts.
  useEffect(() => {
    return () => { if (posterPollTimerRef.current) clearTimeout(posterPollTimerRef.current); };
  }, []);

  // Poll the temporary-media API until the newly uploaded item has a real poster.
  // Called after assembleUpload resolves. Stops after maxAttempts or on success.
  // This is the safety net for when the WS `playlist_poster_updated` message is
  // missed (e.g. because the WebSocket briefly dropped during the upload).
  const pollForPoster = (itemId, attempt = 0) => {
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 3000;
    if (attempt >= MAX_ATTEMPTS || !itemId) return;

    posterPollTimerRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('wewatch_token');
        const resp = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/temporary-media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const items = data.temporary_media_items || [];
        const target = items.find(it => (it.ID || it.id) === itemId);
        if (target?.poster_url && !target.poster_url.includes('placeholder-poster')) {
          // Real poster is ready — refresh the playlist once more.
          console.log(`🖼️ [PosterPoll] Poster ready for item ${itemId}: ${target.poster_url}`);
          if (onUploadComplete) { playSuccess(); onUploadComplete(); }
        } else {
          // Not ready yet — schedule next poll.
          pollForPoster(itemId, attempt + 1);
        }
      } catch (_) {
        pollForPoster(itemId, attempt + 1);
      }
    }, INTERVAL_MS);
  };

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

  // Sync Ghost Mode when isSessionPrivate prop changes (handles late-arriving prop)
  useEffect(() => {
    if (isSessionPrivate) setHidePreviewThumbnails(true);
  }, [isSessionPrivate]);

  // Fallback: self-validate using sessionStatus when sidebar opens (catches prop-arrival race)
  useEffect(() => {
    if (!sessionStatus || !isLeftSidebarOpen) return;
    const shouldEnforceGhost = sessionStatus.isPrivate || sessionStatus.hideFromLobby;
    if (shouldEnforceGhost && !hidePreviewThumbnails) {
      console.warn('[LeftSidebar] Ghost Mode corrected via self-validation (prop was stale)');
      setHidePreviewThumbnails(true);
    }
  }, [sessionStatus, isLeftSidebarOpen, hidePreviewThumbnails, isSessionPrivate]);

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
      toast.error("Camera unavailable. Check browser permissions.");
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

  // Retrying onError for poster images: CDN propagation can take 10-30s after upload.
  // Retries the original URL up to 3 times with increasing delays before falling back.
  const handlePosterError = (e) => {
    const img = e.target;
    const retries = parseInt(img.dataset.posterRetries || '0');
    if (!img.dataset.posterOrigSrc) img.dataset.posterOrigSrc = img.src;
    const origSrc = img.dataset.posterOrigSrc;
    const isPlaceholder = origSrc.includes('placeholder-poster');
    if (!isPlaceholder && retries < 3) {
      img.dataset.posterRetries = String(retries + 1);
      setTimeout(() => {
        img.src = origSrc + (origSrc.includes('?') ? '&' : '?') + '_r=' + Date.now();
      }, 5000 * (retries + 1)); // 5s → 10s → 15s
    } else {
      img.src = '/icons/placeholder-poster.jpg';
    }
  };

  const getVideoDurationFromFile = (file) =>
    new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const s = Math.floor(video.duration) || 0;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        resolve(
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        );
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => { URL.revokeObjectURL(video.src); resolve('00:00:00'); };
      video.src = URL.createObjectURL(file);
    });

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
          const token = localStorage.getItem('wewatch_token');
          const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/temporary-media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('🎨 [Poster Retry] Received updated media items:', data);
            
            // Trigger parent to refresh playlist with updated posters
            if (onUploadComplete) {
              playSuccess();
              onUploadComplete();
            }
          }
        } catch (err) {
          console.warn('⚠️ [Poster Retry] Failed to fetch updated poster:', err);
        }
      }, 5000); // Wait 5s for async poster generation + CDN upload

      if (onUploadComplete) {
        playSuccess();
        onUploadComplete();
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.message?.includes('cancel')) {
        console.log('🚫 [Upload] Cancelled');
        clearChunkUploadState(uploadId);
        localStorage.removeItem('current_upload_id');
        toast('Upload cancelled.');
      } else {
        console.error("❌ [Upload] Failed:", err);
        clearChunkUploadState(uploadId);
        localStorage.removeItem('current_upload_id');
        toast.error(`Upload failed: ${err.message}`);
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

  // Direct BunnyCDN upload path (production only).
  // Browser → Vercel Edge Function → BunnyCDN (no Railway for binary data).
  // After upload, Railway is notified via a tiny JSON confirm call.
  // resumeState: saved state from a previous interrupted upload (Option A).
  const uploadFileDirect = async (file, resumeState = null) => {
    // Keep the ref current so the online-event auto-retry handler always finds this function.
    uploadFileDirectRef.current = uploadFileDirect;

    setUploading(true);
    setUploadPaused(false);
    uploadPausedRef.current = false;
    setUploadProgress(resumeState
      ? Math.round(((resumeState.completedChunks?.length ?? 0) / (resumeState.totalChunks ?? 1)) * 100)
      : 0);
    setUploadSpeed(0);
    setUploadETA('Calculating...');
    setUploadedBytes(0);
    setTotalBytes(file.size);
    uploadStartTimeRef.current = Date.now();

    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;
    let shouldPause = false; // local flag — safe to read inside finally

    // Option A: track the uploadId once the first chunk completes so we can clean up on success.
    let activeBunnyUploadId = null;

    // Option A: save progress to localStorage after each successful chunk.
    const handleChunkComplete = (completedIndices, uploadId, chunkSize) => {
      activeBunnyUploadId = uploadId;
      const totalChunksEstimate = Math.ceil(file.size / chunkSize);
      localStorage.setItem('current_bunny_upload_id', uploadId);
      localStorage.setItem(`wewatch_bunny_upload_${uploadId}`, JSON.stringify({
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        chunkSize,
        totalChunks: totalChunksEstimate,
        completedChunks: completedIndices,
        roomId,
        sessionId: sessionId || '',
        timestamp: Date.now(),
      }));
    };

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      // Reuse the cdnPath and cdnUrl from the original upload if resuming; otherwise generate fresh.
      const uniqueId = resumeState?.uniqueId ?? crypto.randomUUID();
      const cdnFolder = (sessionId || resumeState?.sessionId) ? 'temp-media' : 'media';
      const cdnPath = resumeState?.cdnPath ?? `${cdnFolder}/${uniqueId}.${ext}`;
      const pullZoneUrl = import.meta.env.VITE_BUNNY_PULL_ZONE_URL?.replace(/\/$/, '');
      const cdnUrl = resumeState?.cdnUrl ?? `${pullZoneUrl}/${cdnPath}`;

      console.log(`🚀 [DirectUpload] ${resumeState ? 'Resuming' : 'Starting'}: ${file.name} → ${cdnPath}`);

      // Get duration before upload (fast, runs locally in browser)
      const duration = resumeState?.duration ?? await getVideoDurationFromFile(file);

      const startTime = Date.now();
      const { uploadId, totalChunks } = await uploadFileToBunnyCDN(
        file,
        cdnPath,
        (percent, loaded, total) => {
          const now = Date.now();
          if (now - lastProgressUpdateRef.current < 500 && percent < 100) return;
          lastProgressUpdateRef.current = now;

          const elapsedSeconds = (now - startTime) / 1000;
          const speed = loaded / 1024 / 1024 / (elapsedSeconds || 1);
          const remainingBytes = total - loaded;
          const etaSeconds = remainingBytes / (speed * 1024 * 1024);

          setUploadProgress(percent);
          setUploadedBytes(loaded);
          setUploadSpeed(speed);
          if (etaSeconds < 60) setUploadETA(`${Math.round(etaSeconds)}s`);
          else if (etaSeconds < 3600) setUploadETA(`${Math.round(etaSeconds / 60)}m`);
          else setUploadETA(`${Math.round(etaSeconds / 3600)}h`);
        },
        abortController.signal,
        resumeState,      // Option A: pass saved state (null = fresh upload)
        handleChunkComplete, // Option A: persist per-chunk progress
      );

      console.log(`[DirectUpload] All chunks on BunnyCDN, requesting assembly...`);
      setUploadProgress(99);

      // Save assembly metadata in case assembleUpload itself fails (so we can retry without
      // re-uploading all chunks — they're already on BunnyCDN).
      if (activeBunnyUploadId) {
        localStorage.setItem(`wewatch_bunny_upload_${activeBunnyUploadId}`, JSON.stringify({
          uploadId,
          fileName: file.name,
          fileSize: file.size,
          chunkSize: resumeState?.chunkSize ?? Math.ceil(file.size / totalChunks),
          totalChunks,
          completedChunks: Array.from({ length: totalChunks }, (_, i) => i), // all done
          roomId,
          sessionId: sessionId || '',
          cdnPath,
          cdnUrl,
          uniqueId,
          duration,
          needsAssembly: true,
          timestamp: Date.now(),
        }));
      }

      const assembleResp = await assembleUpload(roomId, {
        upload_id: uploadId,
        total_chunks: totalChunks,
        original_name: file.name,
        mime_type: file.type || `video/${ext}`,
        file_size: file.size,
        session_id: sessionId || '',
        duration,
      });

      // Option A: success — clear persisted state.
      if (activeBunnyUploadId) {
        localStorage.removeItem(`wewatch_bunny_upload_${activeBunnyUploadId}`);
        localStorage.removeItem('current_bunny_upload_id');
      }

      console.log('✅ [DirectUpload] DB record created');
      if (onUploadComplete) { playSuccess(); onUploadComplete(); }

      // Poster is generated async on Railway after assembly.
      // The WS `playlist_poster_updated` message updates the UI instantly when the
      // socket is healthy. pollForPoster is the fallback for when the WS message
      // is missed (brief disconnect during a long mobile upload).
      const newItemId = assembleResp?.data?.media_item_id;
      if (newItemId) pollForPoster(newItemId);
    } catch (err) {
      if (err.name === 'CanceledError' || err.message?.includes('cancel')) {
        if (visibilityPauseRef.current) {
          // Tab switched — preserve state so the visibilitychange handler can auto-resume.
          console.log('⏸ [DirectUpload] Paused (tab hidden) — will resume on return');
          shouldPause = true;
          uploadPausedRef.current = true;
          setUploadPaused(true);
          setUploadSpeed(0);
          setUploadETA('Resuming when you return…');
        } else {
          // User explicitly cancelled — clear everything.
          console.log('🚫 [DirectUpload] Cancelled');
          if (activeBunnyUploadId) {
            localStorage.removeItem(`wewatch_bunny_upload_${activeBunnyUploadId}`);
            localStorage.removeItem('current_bunny_upload_id');
          }
          uploadFileRef.current = null;
          toast('Upload cancelled.');
        }
      } else {
        console.error('❌ [DirectUpload] Network error, entering paused state:', err);
        // Same-session: File object is still in memory. Pause and auto-retry on reconnect
        // rather than giving up. localStorage state is already up-to-date.
        shouldPause = true;
        uploadPausedRef.current = true;
        setUploadPaused(true);
        setUploadSpeed(0);
        setUploadETA('Waiting for connection…');
      }
    } finally {
      if (!shouldPause) {
        // Clean reset — either success or cancel.
        setUploading(false);
        setUploadProgress(0);
        setUploadSpeed(0);
        setUploadETA('');
        setUploadedBytes(0);
        setTotalBytes(0);
      }
      uploadAbortControllerRef.current = null;
    }
  };

  const handleFileUpload = async (files) => {
    if (!files?.length || !roomId) return;

    const file = files[0];

    // ✅ CLIENT-SIDE VALIDATION
    const allowedTypes = [
      // Video
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
      'video/avi', 'video/x-msvideo', 'video/x-m4v', 'video/x-wmv',
      'video/3gpp', 'video/mp2t',
      // Audio
      'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
      'audio/flac', 'audio/aac', 'audio/x-m4a',
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Invalid file type: ${file.type}. Allowed: MP4, WebM, MOV, MKV, AVI, MP3, M4A, WAV, AAC, FLAC`);
      return;
    }

    const maxSize = 1 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large (${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB). Maximum is 1 GB.`);
      return;
    }

    if (file.size < 1024) {
      toast.error('File too small. Please select a valid media file.');
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

    // Option A: check if this file matches a pending BunnyCDN resume by name + size.
    let resumeState = null;
    if (
      pendingResumeData?.uploadPath === 'bunny' &&
      pendingResumeData.fileName === file.name &&
      pendingResumeData.fileSize === file.size
    ) {
      resumeState = pendingResumeData;
      setShowResumeUpload(false);
      setPendingResumeData(null);
      const completed = resumeState.completedChunks?.length ?? 0;
      const total = resumeState.totalChunks ?? 1;
      toast.success(`Resuming from ${Math.round((completed / total) * 100)}%…`);
    }

    // Keep the File object alive for same-session auto-retry on network drop.
    uploadFileRef.current = file;
    uploadFileDirectRef.current = uploadFileDirect;

    if (import.meta.env.PROD) {
      await uploadFileDirect(file, resumeState);
    } else {
      await uploadFileChunked(file);
    }
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

    // Clear any saved upload state (dev path + BunnyCDN path)
    const uploads = Object.keys(localStorage).filter(key => key.startsWith('wewatch_chunk_upload_'));
    uploads.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('wewatch_active_upload');
    const bunnyId = localStorage.getItem('current_bunny_upload_id');
    if (bunnyId) {
      localStorage.removeItem(`wewatch_bunny_upload_${bunnyId}`);
      localStorage.removeItem('current_bunny_upload_id');
    }

    // Clear same-session refs so auto-retry doesn't fire after a deliberate cancel.
    uploadFileRef.current = null;
    uploadPausedRef.current = false;
    setUploadPaused(false);
    setUploading(false);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadETA('');
    setUploadedBytes(0);
    setTotalBytes(0);
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
    
    // ✅ Embed platforms are resolved server-side — pass them straight through
    const embedPlatforms = ['drive.google.com', 'youtube.com', 'youtu.be', 'twitch.tv'];
    if (embedPlatforms.some(p => urlLower.includes(p))) {
      console.log('✅ [validateStreamUrl] Embed platform URL — passing to backend');
      return { valid: true };
    }

    // ❌ Other cloud storage providers are still blocked (CORS issues)
    const blockedProviders = [
      { domain: 'dropbox.com', name: 'Dropbox' },
      { domain: 'onedrive.live.com', name: 'OneDrive' },
      { domain: '1drv.ms', name: 'OneDrive' }
    ];
    for (const provider of blockedProviders) {
      if (urlLower.includes(provider.domain)) {
        return { valid: false, error: `${provider.name} isn't supported. Try Google Drive instead.` };
      }
    }

    // For direct URLs, check for video file extensions
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.m3u8', '.avi', '.mkv', '.flv', '.wmv', '.m4v'];
    const hasVideoExtension = videoExtensions.some(ext => urlLower.includes(ext));

    if (!hasVideoExtension) {
      console.log('❌ [validateStreamUrl] No video extension found in URL');
      return { valid: false, error: 'Paste a Google Drive / Twitch link, or a direct video URL (.mp4, .webm, .m3u8). For YouTube, use the YouTube Co-Watch box in Watch From.' };
    }
    
    console.log('✅ [validateStreamUrl] Valid video URL');
    return { valid: true };
  };

  const handleStreamFromUrl = async () => {
    if (!streamUrl.trim()) {
      setUrlError('Please enter a video URL');
      return;
    }
    // YouTube → legal iframe API path (not stream/embed)
    const ytId = extractYouTubeVideoId(streamUrl.trim());
    if (ytId) {
      onPlayYouTube?.(ytId, streamUrl.trim());
      setStreamUrl('');
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
        playSuccess();
        onUploadComplete();
      }

      toast.success('Stream URL added to playlist!');
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

  // ticketSafe: true  = safe even when admission is charged (public domain, ministry streams, etc.)
  // ticketSafe: false = medium/high legal risk in paid sessions (CC-NC content, licensed streams)

  // 🎓 Educational platforms — screen-share safe, open/CC licensed
  // YouTube handled separately via iframe API.
  const educationalPlatforms = [
    { id: 'archive',     name: 'Internet Archive',   url: 'https://archive.org',            ticketSafe: true  }, // public domain / open access
    { id: 'gutenberg',   name: 'Project Gutenberg',  url: 'https://www.gutenberg.org',      ticketSafe: true  }, // public domain — zero risk
    { id: 'mitocw',      name: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu',            ticketSafe: false }, // CC BY-NC — non-commercial clause
    { id: 'openYale',    name: 'Open Yale Courses',  url: 'https://oyc.yale.edu',           ticketSafe: false }, // CC BY-NC
    { id: 'pbslearn',    name: 'PBS LearningMedia',  url: 'https://pbslearningmedia.org',   ticketSafe: false }, // CC BY-NC
    { id: 'ted',         name: 'TED Talks',          url: 'https://www.ted.com',            ticketSafe: false }, // CC BY-NC-SA
    { id: 'khanacademy', name: 'Khan Academy',       url: 'https://www.khanacademy.org',    ticketSafe: false }, // CC BY-NC-SA
    { id: 'vimeo',       name: 'Vimeo',              url: 'https://www.vimeo.com',          ticketSafe: false }, // creator holds copyright
    { id: 'dailymotion', name: 'Dailymotion',        url: 'https://www.dailymotion.com',    ticketSafe: false },
    { id: 'wattpad',     name: 'Wattpad',            url: 'https://www.wattpad.com',        ticketSafe: false }, // author holds copyright
  ];

  // 🙏 Religious platforms — ministry streams want reach, all ticketSafe
  // YouTube church streams: paste YouTube URL in the Watch From YouTube box above.
  const religiousPlatforms = [
    // Nigerian Churches
    { id: 'christembassy',  name: 'Christ Embassy',       url: 'https://christembassy.org/live',            ticketSafe: true },
    { id: 'rccg',           name: 'RCCG',                 url: 'https://rccg.org',                          ticketSafe: true },
    { id: 'winnerschapel',  name: 'Winners Chapel',       url: 'https://www.davidoyedepoministries.org',    ticketSafe: true },
    { id: 'deeperlife',     name: 'Deeper Life',          url: 'https://www.deeperlife.org',                ticketSafe: true },
    { id: 'mfm',            name: 'Mountain of Fire',     url: 'https://mountainoffire.org',                ticketSafe: true },
    { id: 'dunamis',        name: 'Dunamis International',url: 'https://dunamisgospel.org',                 ticketSafe: true },
    { id: 'hotr',           name: 'House on the Rock',    url: 'https://www.hotr.org.ng',                   ticketSafe: true },
    { id: 'daystarng',      name: 'Daystar Christian',    url: 'https://daystarng.org',                     ticketSafe: true },
    { id: 'covenantnation', name: 'Covenant Nation',      url: 'https://thecovenantnation.com',             ticketSafe: true },
    { id: 'elevationng',    name: 'Elevation Church',     url: 'https://elevationchurch.tv',                ticketSafe: true },
    // International Networks
    { id: 'tbn',            name: 'TBN',                  url: 'https://watch.tbn.org',                     ticketSafe: true },
    { id: 'daystar',        name: 'Daystar',              url: 'https://www.daystar.com/live',              ticketSafe: true },
    { id: 'godtv',          name: 'GOD TV',               url: 'https://god.tv',                            ticketSafe: true },
    { id: 'cbn',            name: 'CBN',                  url: 'https://www1.cbn.com/cbnnews/live',         ticketSafe: true },
    { id: 'ewtn',           name: 'EWTN',                 url: 'https://www.ewtn.com/live',                 ticketSafe: true },
    { id: 'vatican',        name: 'Vatican Media',        url: 'https://www.vaticannews.va/en.html',        ticketSafe: true },
    { id: 'hillsong',       name: 'Hillsong Channel',     url: 'https://hillsong.com/channel',              ticketSafe: true },
    { id: 'lifechurch',     name: 'Life.Church',          url: 'https://live.life.church',                  ticketSafe: true },
    { id: 'sermonaudio',    name: 'SermonAudio',          url: 'https://www.sermonaudio.com',               ticketSafe: true },
    { id: 'preachtheword',  name: 'Preach the Word',      url: 'https://www.preachtheword.com',             ticketSafe: true },
  ];

  // 🎬 Entertainment platforms — screen-share safe, no DRM
  // YouTube handled separately via iframe API.
  const entertainmentPlatforms = [
    // 🎵 Music — CC/public broadcast (ticketSafe), licensed streaming (not)
    { id: 'jamendo',         name: 'Jamendo',         url: 'https://www.jamendo.com',                    ticketSafe: true  }, // 100% Creative Commons music
    { id: 'radiogarden',     name: 'Radio Garden',    url: 'https://radio.garden',                       ticketSafe: true  }, // live public radio from any city in the world
    { id: 'ntsradio',        name: 'NTS Radio',       url: 'https://www.nts.live',                       ticketSafe: true  }, // independent culture radio, public broadcast
    { id: 'audiomack',       name: 'Audiomack',       url: 'https://audiomack.com',                      ticketSafe: false }, // Nigerian/African music — free tier, licensed
    { id: 'boomplay',        name: 'Boomplay',        url: 'https://www.boomplay.com',                   ticketSafe: false }, // pan-African music & video
    // 📺 Live streaming (medium risk — licensed content)
    { id: 'twitch',          name: 'Twitch',          url: 'https://www.twitch.tv',                      ticketSafe: false },
    { id: 'kick',            name: 'Kick',            url: 'https://kick.com',                           ticketSafe: false },
    { id: 'caffeine',        name: 'Caffeine',        url: 'https://www.caffeine.tv',                    ticketSafe: false },
    { id: 'rumble',          name: 'Rumble',          url: 'https://rumble.com',                         ticketSafe: false },
    // 🎞️ VOD / Free streaming (high risk — licensed studio content)
    { id: 'vimeo',           name: 'Vimeo',           url: 'https://vimeo.com',                          ticketSafe: false },
    { id: 'dailymotion',     name: 'Dailymotion',     url: 'https://www.dailymotion.com',                ticketSafe: false },
    { id: 'tubi',            name: 'Tubi',            url: 'https://tubitv.com',                         ticketSafe: false },
    { id: 'crackle',         name: 'Crackle',         url: 'https://www.crackle.com',                    ticketSafe: false },
    { id: 'xumo',            name: 'Xumo Play',       url: 'https://www.xumo.com',                       ticketSafe: false },
    { id: 'redbulltv',       name: 'Red Bull TV',     url: 'https://www.redbull.com/int-en/tv',          ticketSafe: false },
    { id: 'retrocrush',      name: 'RetroCrush',      url: 'https://www.retrocrush.tv',                  ticketSafe: false },
    // 🕹️ Retro & browser gaming (host plays, members watch — all ticketSafe where content is open)
    { id: 'internetarchive', name: 'Archive Games',   url: 'https://archive.org/games',                  ticketSafe: true  }, // thousands of browser-playable public domain games
    { id: 'newgrounds',      name: 'Newgrounds',      url: 'https://www.newgrounds.com',                 ticketSafe: true  }, // creator-owned Flash/browser games & animations
    { id: 'itchio',          name: 'itch.io',         url: 'https://itch.io',                            ticketSafe: true  }, // indie games, many browser-playable, creator-owned
    { id: 'javagames',       name: 'Java Games',      url: 'https://javagames.cc',                       ticketSafe: false }, // classic Java applets — copyright uncertain on some titles
    { id: 'crazygames',      name: 'CrazyGames',      url: 'https://www.crazygames.com',                 ticketSafe: true  }, // browser games, original content
    { id: 'gamejolt',        name: 'Game Jolt',       url: 'https://gamejolt.com',                       ticketSafe: true  }, // indie game community, creator-owned
    { id: 'classicreload',   name: 'ClassicReload',   url: 'https://classicreload.com',                  ticketSafe: false }, // DOS/Windows games — abandonware gray zone
    // 📖 Reading & Comics
    { id: 'gutenberg',       name: 'Project Gutenberg', url: 'https://www.gutenberg.org',               ticketSafe: true  }, // public domain
    { id: 'archive',         name: 'Internet Archive',  url: 'https://archive.org',                     ticketSafe: true  }, // public domain
    { id: 'comicbookplus',   name: 'Comic Book Plus',   url: 'https://comicbookplus.com',               ticketSafe: true  }, // golden-age public domain comics
    { id: 'wattpad',         name: 'Wattpad',           url: 'https://www.wattpad.com',                 ticketSafe: false },
    { id: 'webtoon',         name: 'Webtoon',           url: 'https://www.webtoons.com',                ticketSafe: false },
    { id: 'mangaplus',       name: 'MangaPlus',         url: 'https://mangaplus.shueisha.co.jp',        ticketSafe: false },
    { id: 'archiveofourown', name: 'Archive of Our Own',url: 'https://archiveofourown.org',             ticketSafe: false },
  ];

  // ── Ticketing gate ──────────────────────────────────────────────────────────
  const isTicketedSession = !!(sessionStatus?.ticketing_enabled);

  // ✅ Choose platform list based on content rating and watch type
  const isLectureHallContext = watchType === 'classroom' && classType === 'lecture_hall';
  const contentRating = sessionStatus?.content_rating || 'G';

  const allPlatforms =
    contentRating === 'Religious' ? religiousPlatforms :
    (isLectureHallContext || contentRating === 'Educational') ? educationalPlatforms :
    entertainmentPlatforms;

  // Hide medium/high-risk platforms in paid sessions; always pass ticketSafe ones through
  const platforms = isTicketedSession ? allPlatforms.filter(p => p.ticketSafe) : allPlatforms;

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

      {/* ⚙️ Settings + Report — far-right shortcuts above ghost mode */}
      <div className="flex justify-end gap-2 mb-2">
        {/* Report Session — only for non-hosts */}
        {!isHostProp && (
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-red-600/30 transition-colors text-gray-400 hover:text-red-400 text-sm"
            title="Report Session"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            <span>Report</span>
          </button>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('wewatch:open-settings'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/60 transition-colors text-gray-300 hover:text-white text-sm"
          title="Settings"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
        </button>
      </div>

      {showReportModal && (
        <ReportModal
          targetType="session"
          targetId={sessionId}
          targetName={`Session in room ${roomId}`}
          onClose={() => setShowReportModal(false)}
        />
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
              onClick={() => { intendedTabRef.current = tab; setActiveTab(tab); }}
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
                    {uploading ? (uploadPaused ? 'Paused…' : 'Uploading...') : 'Browse Files'}
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
                  {/* Platform logo chips — shown on focus to signal what's supported */}
                  {urlInputFocused && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {/* Google Drive — embed supported */}
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-900/40 border border-green-700/50 rounded-full">
                        <svg className="w-3 h-3" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L28 52H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                          <path d="M43.65 25L29.4 0c-1.35.8-2.5 1.9-3.3 3.3l-25.8 44.7A9.06 9.06 0 000 52h28z" fill="#00AC47"/>
                          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.3l5.9 11.5z" fill="#EA4335"/>
                          <path d="M43.65 25L57.9 0H29.4z" fill="#00832D"/>
                          <path d="M59.3 52H28L13.75 76.8h49.9z" fill="#2684FC"/>
                          <path d="M73.4 26.45l-12.9-22.3c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.3 52h27.9c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
                        </svg>
                        <span className="text-green-300 text-[9px] font-medium">Google Drive</span>
                        <span className="text-green-500 text-[8px]">embed ✓</span>
                      </div>
                      {/* YouTube — Watch From */}
                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded-full" title="YouTube works via Watch From (screen share)">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.52 3.6 12 3.6 12 3.6s-7.52 0-9.38.45A3.02 3.02 0 00.5 6.19C.06 8.07 0 12 0 12s.06 3.93.5 5.81a3.02 3.02 0 002.12 2.14C4.48 20.4 12 20.4 12 20.4s7.52 0 9.38-.45a3.02 3.02 0 002.12-2.14C23.94 15.93 24 12 24 12s-.06-3.93-.5-5.81zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z"/></svg>
                        <span className="text-gray-400 text-[9px]">YouTube</span>
                        <span className="text-gray-500 text-[8px]">Watch From</span>
                      </div>
                      {/* Twitch — Watch From */}
                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded-full" title="Twitch works via Watch From (screen share)">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                        <span className="text-gray-400 text-[9px]">Twitch</span>
                        <span className="text-gray-500 text-[8px]">Watch From</span>
                      </div>
                    </div>
                  )}

                  <input
                    type="url"
                    value={streamUrl}
                    onChange={(e) => { setStreamUrl(e.target.value); setUrlError(null); }}
                    onFocus={() => setUrlInputFocused(true)}
                    onBlur={() => setTimeout(() => setUrlInputFocused(false), 200)}
                    onKeyPress={(e) => { if (e.key === 'Enter' && !isValidatingUrl) handleStreamFromUrl(); }}
                    placeholder="Paste Google Drive, Twitch, or direct video URL (.mp4, .webm, .m3u8)…"
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
                    {isValidatingUrl ? 'Adding…' : 'Add to Playlist'}
                  </button>
                </div>
                
                {uploading && (
                  <div className="w-full mt-3">
                    {/* Progress bar — amber when paused, blue when active */}
                    <div className="bg-gray-700 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all ${uploadPaused ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>

                    {/* Paused banner */}
                    {uploadPaused && (
                      <p className="text-amber-400 text-xs font-medium mb-1 flex items-center gap-1">
                        <span>⏸</span>
                        <span>Paused — will resume automatically when connection returns</span>
                      </p>
                    )}

                    {/* Progress details */}
                    <div className="flex justify-between items-center text-xs text-gray-300">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{uploadProgress}%</span>
                        <span className="text-gray-400">•</span>
                        <span>{formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {uploadSpeed > 0 && !uploadPaused && (
                          <>
                            <span className="text-green-400">{uploadSpeed.toFixed(1)} MB/s</span>
                            <span className="text-gray-400">•</span>
                          </>
                        )}
                        <span className={uploadPaused ? 'text-amber-400' : 'text-blue-400'}>{uploadETA}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-2">
                      {uploadPaused && (
                        <button
                          onClick={() => {
                            if (!uploadFileRef.current) return;
                            const bunnyId = localStorage.getItem('current_bunny_upload_id');
                            let savedState = null;
                            if (bunnyId) {
                              try { savedState = JSON.parse(localStorage.getItem(`wewatch_bunny_upload_${bunnyId}`) || 'null'); } catch (_) {}
                            }
                            uploadFileDirectRef.current?.(uploadFileRef.current, savedState);
                          }}
                          className="flex-1 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg font-medium text-xs transition-colors"
                        >
                          Retry Now
                        </button>
                      )}
                      <button
                        onClick={handleCancelUpload}
                        className="flex-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium text-xs transition-colors"
                      >
                        Cancel Upload
                      </button>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,audio/aac,audio/x-m4a"
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
            
            // Check if Quiz button should show (Lecture Hall OR Educational content)
            const showQuizButton = ((watchType === 'classroom' && classType === 'lecture_hall') || contentRating === 'Educational') && onQuizClick;
            
            return (
              <div className="flex justify-around items-center gap-4 mb-3 sm:mb-4 px-2">
                {/* START/END GAME BUTTON (Host Only - Hidden for Educational/Religious) */}
                {showGameButton && (onGameClick || onGameClose) && (
                  <button
                    onClick={() => {
                      if (activeGame) {
                        if (onGameClose) {
                          onGameClose();
                          toast.success('Game ended', { icon: '🎮' });
                        }
                      } else {
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

                {/* SERMON BUTTON (Religious Content Only) */}
                {showReligiousButtons && (
                  <button
                    onClick={() => {
                      console.log('📜 [LeftSidebar] Sermon button clicked!');
                      setShowSermonSelector(true);
                    }}
                    className="flex flex-col items-center gap-1.5 hover:opacity-70 transition-all group"
                  >
                    <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] text-gray-300 font-medium">Sermon</span>
                  </button>
                )}
              </div>
            );
          })()}

          <div className="flex-1 mt-3 sm:mt-4 min-h-0">
            <div className="h-full flex flex-col p-3 sm:p-4 bg-[#D9D9D9]/10 rounded-xl overflow-y-auto">

              {/* ACTIVE QUIZZES (Lecture Hall OR Educational content - Students) */}
              {!isHost && ((watchType === 'classroom' && classType === 'lecture_hall') || contentRating === 'Educational') && onTakeQuiz && (() => {
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
                      onError={handlePosterError}
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
                          console.log('🎬 [LeftSidebar] HOST clicked media item:', {
                            id: item.ID || item.id,
                            name: item.original_name,
                            file_path: item.file_path,
                            file_url: item.file_url,
                            watchType,
                            classType,
                          });
                          playSuccess();
                          onMediaSelect({ ...item, type: item.is_embed ? 'embed' : 'upload' });

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
                      {item.is_embed ? (
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded flex items-center justify-center bg-gray-700 flex-shrink-0">
                          {item.embed_platform === 'google_drive' && (
                            <svg className="w-6 h-6" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L28 52H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                              <path d="M43.65 25L29.4 0c-1.35.8-2.5 1.9-3.3 3.3l-25.8 44.7A9.06 9.06 0 000 52h28z" fill="#00AC47"/>
                              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.3l5.9 11.5z" fill="#EA4335"/>
                              <path d="M43.65 25L57.9 0H29.4z" fill="#00832D"/>
                              <path d="M59.3 52H28L13.75 76.8h49.9z" fill="#2684FC"/>
                              <path d="M73.4 26.45l-12.9-22.3c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.3 52h27.9c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
                            </svg>
                          )}
                          {item.embed_platform === 'youtube' && (
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.52 3.6 12 3.6 12 3.6s-7.52 0-9.38.45A3.02 3.02 0 00.5 6.19C.06 8.07 0 12 0 12s.06 3.93.5 5.81a3.02 3.02 0 002.12 2.14C4.48 20.4 12 20.4 12 20.4s7.52 0 9.38-.45a3.02 3.02 0 002.12-2.14C23.94 15.93 24 12 24 12s-.06-3.93-.5-5.81zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z"/></svg>
                          )}
                          {item.embed_platform === 'twitch' && (
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                          )}
                        </div>
                      ) : (
                        <img
                          src={item.poster_url || '/icons/placeholder-poster.jpg'}
                          onError={handlePosterError}
                          alt={item.original_name}
                          className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs sm:text-sm font-medium truncate">{item.original_name}</p>
                        <p className="text-gray-400 text-[10px] sm:text-xs">
                          {item.is_embed
                            ? ({ google_drive: 'Google Drive', youtube: 'YouTube', twitch: 'Twitch' }[item.embed_platform] || 'Embed')
                            : item.duration}
                        </p>
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
            podcastConfig={podcastConfig}
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
            onWizardStateChange={onWizardStateChange}
            contentRating={contentRating}
            availableCameras={availableCameras}
            selectedCameraId={selectedCameraId}
            onCameraSwitch={onCameraSwitch}
            autoOpenGuestInvite={autoOpenGuestInvite}
            onGuestInviteConsumed={onGuestInviteConsumed}
          />
        </div>
      )}

      {/* WATCH FROM TAB — host only */}
      {activeTab === 'watchfrom' && isHost && (
        <div className="p-3 sm:p-4 h-full flex flex-col">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Watch From Platform</h3>
          
          {/* Legal Notice — changes wording for ticketed sessions */}
          {isTicketedSession ? (
            <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-amber-300 text-[10px] leading-relaxed font-medium mb-1">🎫 Paid session — content restrictions apply</p>
              <p className="text-amber-200/70 text-[9px] leading-relaxed">
                Platforms with licensed content are hidden. For paid sessions, use the <strong>Upload tab</strong> with your own content, or screen-share public-domain / ministry sources shown below.
              </p>
            </div>
          ) : (
            <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-blue-300 text-[10px] leading-relaxed">
                📺 Screen share from legal platforms. You must have a valid account. LetsWatchOut doesn't host content.
              </p>
            </div>
          )}

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

          {/* YouTube — legal iframe API (no screen share needed) */}
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="#FF0000">
                <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.52 3.6 12 3.6 12 3.6s-7.52 0-9.38.45A3.02 3.02 0 00.5 6.19C.06 8.07 0 12 0 12s.06 3.93.5 5.81a3.02 3.02 0 002.12 2.14C4.48 20.4 12 20.4 12 20.4s7.52 0 9.38-.45a3.02 3.02 0 002.12-2.14C23.94 15.93 24 12 24 12s-.06-3.93-.5-5.81zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z"/>
              </svg>
              <span className="text-white text-xs font-semibold">YouTube Co-Watch</span>
              <span className="ml-auto text-green-400 text-[9px] font-medium bg-green-400/10 px-1.5 py-0.5 rounded-full">✓ legal iframe</span>
            </div>
            <p className="text-gray-400 text-[10px] mb-2 leading-relaxed">
              Everyone loads the same video in their own YouTube player — synced via WeWatch. No screen share needed.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={ytUrl}
                onChange={(e) => { setYtUrl(e.target.value); setYtError(''); }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const id = extractYouTubeVideoId(ytUrl.trim());
                  if (!id) { setYtError('Paste a valid YouTube URL'); return; }
                  onPlayYouTube?.(id, ytUrl.trim());
                  setYtUrl('');
                }}
                placeholder="Paste YouTube URL…"
                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-red-400"
              />
              <button
                onClick={() => {
                  const id = extractYouTubeVideoId(ytUrl.trim());
                  if (!id) { setYtError('Paste a valid YouTube URL'); return; }
                  onPlayYouTube?.(id, ytUrl.trim());
                  setYtUrl('');
                }}
                disabled={!ytUrl.trim()}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Play
              </button>
            </div>
            {ytError && <p className="text-red-400 text-[10px] mt-1">{ytError}</p>}
          </div>

          <p className="text-gray-500 text-[10px] mb-2 font-medium uppercase tracking-wide">Screen-share platforms</p>

          <div className="mt-1">
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
      {showResumeUpload && pendingResumeData && (() => {
        const isBunny = pendingResumeData.uploadPath === 'bunny';
        const needsAssembly = isBunny && pendingResumeData.needsAssembly;
        const completedCount = isBunny
          ? (pendingResumeData.completedChunks?.length ?? 0)
          : (pendingResumeData.uploadedChunks?.length ?? 0);
        const totalCount = pendingResumeData.totalChunks ?? 1;
        const progressPct = Math.round((completedCount / totalCount) * 100);

        const handleDiscard = () => {
          // Clear dev path state
          const devId = localStorage.getItem('current_upload_id');
          if (devId) { clearChunkUploadState(devId); localStorage.removeItem('current_upload_id'); }
          // Clear BunnyCDN path state
          const bunnyId = localStorage.getItem('current_bunny_upload_id');
          if (bunnyId) {
            localStorage.removeItem(`wewatch_bunny_upload_${bunnyId}`);
            localStorage.removeItem('current_bunny_upload_id');
          }
          setShowResumeUpload(false);
          setPendingResumeData(null);
        };

        const handleResumeAssembly = async () => {
          setShowResumeUpload(false);
          const state = pendingResumeData;
          setPendingResumeData(null);
          try {
            toast('Finalising upload…');
            const finalResp = await assembleUpload(roomId, {
              upload_id: state.uploadId,
              total_chunks: state.totalChunks,
              original_name: state.fileName,
              mime_type: state.mimeType || `video/${state.fileName.split('.').pop()?.toLowerCase() || 'mp4'}`,
              file_size: state.fileSize,
              session_id: state.sessionId || '',
              duration: state.duration || '00:00:00',
            });
            localStorage.removeItem(`wewatch_bunny_upload_${state.uploadId}`);
            localStorage.removeItem('current_bunny_upload_id');
            toast.success('Upload finalised!');
            if (onUploadComplete) { playSuccess(); onUploadComplete(); }
            const resumedItemId = finalResp?.data?.media_item_id;
            if (resumedItemId) pollForPoster(resumedItemId);
          } catch (err) {
            toast.error(`Finalisation failed: ${err.message}`);
          }
        };

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4">
                {needsAssembly ? 'Finalise Upload?' : 'Resume Upload?'}
              </h3>
              <p className="text-gray-300 mb-2">
                {needsAssembly
                  ? 'All chunks uploaded — just needs finalising:'
                  : 'You have an incomplete upload:'}
              </p>
              <p className="text-white font-semibold mb-4 truncate">{pendingResumeData.fileName}</p>
              <div className="mb-4 bg-gray-700 rounded-lg p-3">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Progress:</span>
                  <span className="text-white">{progressPct}%</span>
                </div>
                <div className="bg-gray-600 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-full" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                {needsAssembly
                  ? 'Tap "Finalise" to complete without re-uploading.'
                  : isBunny
                    ? 'Tap "Resume", then re-select the same file to continue where you left off.'
                    : 'Would you like to continue where you left off?'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDiscard}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Discard
                </button>
                {needsAssembly ? (
                  <button
                    onClick={handleResumeAssembly}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-semibold"
                  >
                    Finalise
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowResumeUpload(false);
                      if (!isBunny) {
                        toast('Use the upload button and re-select the same file.', { duration: 5000 });
                      }
                      // For bunny path, pendingResumeData stays set so handleFileUpload can match it.
                    }}
                    className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-semibold"
                  >
                    Resume
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* 📜 Sermon Control Modal (Religious Content) */}
      {showSermonSelector && (
        <SermonControl
          onShowSermon={({ pages, title }) => {
            console.log('📜 [LeftSidebar] Sermon display requested:', { pages: pages.length, title });
            if (sendMessage) {
              sendMessage({
                type: 'sermon_update',
                data: { active: true, pages, title: title || null, currentPage: 0 }
              });
            }
            setShowSermonSelector(false);
            toast.success('Sermon displayed', { icon: '📜' });
          }}
          onHideSermon={() => setShowSermonSelector(false)}
        />
      )}
    </div>
  );
}