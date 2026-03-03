
// src/components/cinema/ui/LeftSidebar.jsx
import { useState, useRef, useEffect } from 'react';
import { uploadMediaToRoom, apiClient } from '../../../services/api';
import { Gamepad2 } from 'lucide-react'; // Game icon

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
  activeQuiz, // Currently active quiz (for students)
  quizHistory, // Quiz history with active_quizzes array (for late joiners)
  onTakeQuiz, // Handler for student to take quiz
  watchType, // 'video', '3d_cinema', or 'classroom'
  classType, // 'classroom' or 'lecture_hall'
  darknessLevel, // ✅ NEW: 'regular' | 'extreme'
  onDarknessLevelChange, // ✅ NEW: Handler for darkness level changes
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
  // ✅ Members see 'upload' tab (view playlist, quizzes) but not 'liveshare'/'watchfrom' (host-only)
  const availableTabs = isHost ? ['upload', 'liveshare', 'watchfrom'] : ['upload'];
  
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
  const [showWatchFromInstructions, setShowWatchFromInstructions] = useState(false);
  const [showLiveShareMenu, setShowLiveShareMenu] = useState(false);
  const [showUploadDisclaimer, setShowUploadDisclaimer] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => {
    return localStorage.getItem('wewatch_upload_terms_accepted') === 'true';
  });

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
  const [hidePreviewThumbnails, setHidePreviewThumbnails] = useState(false);

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

  const handleFileUpload = async (files) => {
    if (!files?.length || !roomId) return;
    
    const file = files[0];
    
    // Check if user has accepted terms
    if (!hasAcceptedTerms) {
      setShowUploadDisclaimer(true);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadETA('Calculating...');
    setUploadedBytes(0);
    setTotalBytes(file.size);
    uploadStartTimeRef.current = Date.now();
    
    // Create abort controller for cancel functionality
    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;

    try {
      await uploadMediaToRoom(
        roomId,
        file,
        (progressData) => {
          if (typeof progressData === 'object') {
            // New format with enhanced data
            setUploadProgress(progressData.percent);
            setUploadedBytes(progressData.loaded);
            setTotalBytes(progressData.total);
            setUploadSpeed(progressData.speed);
            
            // Format ETA
            if (progressData.eta < 60) {
              setUploadETA(`${Math.round(progressData.eta)}s`);
            } else if (progressData.eta < 3600) {
              setUploadETA(`${Math.round(progressData.eta / 60)}m`);
            } else {
              setUploadETA(`${Math.round(progressData.eta / 3600)}h`);
            }
          } else {
            // Legacy format (just percent)
            setUploadProgress(progressData);
          }
        },
        true,
        sessionId,
        abortController.signal
      );

      if (onUploadComplete) {
        console.log('📤 [LeftSidebar] Upload complete, refreshing playlist...');
        onUploadComplete();
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.message?.includes('cancel')) {
        console.log('🚫 [LeftSidebar] Upload cancelled by user');
        alert("Upload cancelled.");
      } else {
        console.error("Upload failed:", err);
        alert("Upload failed. Please check your connection and try again.");
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed(0);
      setUploadETA('');
      setUploadedBytes(0);
      setTotalBytes(0);
      uploadAbortControllerRef.current = null;
    }
  };
  
  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      console.log('🚫 [LeftSidebar] Upload cancel requested');
    }
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
    { id: 'plutotv', name: 'Pluto TV', url: 'https://pluto.tv' },
    { id: 'rokuchannel', name: 'Roku Channel', url: 'https://therokuchannel.roku.com' },
    { id: 'vudu', name: 'Vudu Free', url: 'https://www.vudu.com/content/movies/free' },
    { id: 'plex', name: 'Plex', url: 'https://watch.plex.tv' },
    { id: 'peacock', name: 'Peacock Free', url: 'https://www.peacocktv.com' },
    { id: 'crackle', name: 'Crackle', url: 'https://www.crackle.com' },
    { id: 'freevee', name: 'Freevee', url: 'https://www.amazon.com/freevee' },
    { id: 'xumo', name: 'Xumo Play', url: 'https://www.xumo.com' },
    { id: 'sling', name: 'Sling Freestream', url: 'https://www.sling.com/freestream' },
    { id: 'redbox', name: 'Redbox', url: 'https://www.redbox.com' },
    
    // Library Streaming (Legal - Requires library card)
    { id: 'hoopla', name: 'Hoopla', url: 'https://www.hoopladigital.com' },
    { id: 'kanopy', name: 'Kanopy', url: 'https://www.kanopy.com' },
    
    // Anime & Animation (Free tiers, screen-share friendly)
    { id: 'crunchyroll', name: 'Crunchyroll', url: 'https://www.crunchyroll.com' },
    { id: 'animixplay', name: 'AnimeDao', url: 'https://animedao.to' },
    { id: 'retrocrush', name: 'RetroCrush', url: 'https://www.retrocrush.tv' },
    
    // Sports & Live Events (Free tiers)
    { id: 'redbulltv', name: 'Red Bull TV', url: 'https://www.redbull.com/int-en/tv' },
    { id: 'nfl', name: 'NFL+', url: 'https://www.nfl.com/plus' },
    { id: 'caffeine', name: 'Caffeine', url: 'https://www.caffeine.tv' },
    
    // Reading & Comics (Legal)
    { id: 'webtoon', name: 'Webtoon', url: 'https://www.webtoons.com' },
    { id: 'wattpad', name: 'Wattpad', url: 'https://www.wattpad.com' },
    { id: 'mangaplus', name: 'MangaPlus', url: 'https://mangaplus.shueisha.co.jp' },
    { id: 'comicbookplus', name: 'Comic Book Plus', url: 'https://comicbookplus.com' },
    { id: 'projectgutenberg', name: 'Project Gutenberg', url: 'https://www.gutenberg.org' },
    { id: 'archiveofourown', name: 'Archive of Our Own', url: 'https://archiveofourown.org' },
  ];

  // ✅ Choose platform list based on watch type
  const isLectureHallContext = watchType === 'classroom' && classType === 'lecture_hall';
  const platforms = isLectureHallContext ? educationalPlatforms : entertainmentPlatforms;

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
      className="fixed left-0 top-0 h-full w-full sm:w-[350px] md:w-96 z-40 overflow-y-auto hide-scrollbar left-sidebar"
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
      
      {/* 🖼️ Host Settings - Preview Thumbnails Toggle */}
      {isHost && (
        <div className="mb-3 p-3 sm:p-4 bg-[#D9D9D9]/10 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={hidePreviewThumbnails}
              onChange={handleTogglePreviewThumbnails}
              className="mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-transparent bg-gray-700 cursor-pointer transition-all"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm sm:text-base font-medium text-white group-hover:text-blue-400 transition-colors">
                Hide Preview Thumbnails
              </span>
              <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 leading-relaxed">
                Content moderation - prevents preview frames from showing in room preview
              </p>
            </div>
          </label>
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

      {/* Tab Navigation */}
      <div className="p-2 sm:p-3 bg-[#D9D9D9]/10 rounded-xl">
        <div className="flex gap-1 sm:gap-2">
          {availableTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 h-[40px] sm:h-[43px] flex items-center justify-center text-xs sm:text-sm md:text-[15px] font-normal text-gray-400 transition-colors px-2 ${
                activeTab === tab
                  ? 'text-black font-black bg-[#D9D9D9]/25 rounded-full'
                  : 'hover:text-white'
              }`}
            >
              {tab === 'upload' && <span className="truncate">Upload</span>}
              {tab === 'liveshare' && <span className="truncate">LiveShare</span>}
              {tab === 'watchfrom' && <span className="truncate hidden sm:inline">Watch From</span>}
              {tab === 'watchfrom' && <span className="truncate sm:hidden">Watch</span>}
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

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="h-full flex flex-col p-3 sm:p-4 bg-[#D9D9D9]/10 rounded-xl">
              {/* GAME BUTTON (Host Only - All Watch Types) */}
              {isHost && onGameClick && (
                <button
                  onClick={onGameClick}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 sm:mb-4 shadow-lg flex items-center justify-center gap-2"
                >
                  <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  Start Game
                </button>
              )}

              {/* QUIZ BUTTON (Lecture Hall Only - Host) */}
              {isHost && watchType === 'classroom' && classType === 'lecture_hall' && onQuizClick && (
                <button
                  onClick={onQuizClick}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 sm:mb-4 shadow-lg flex items-center justify-center gap-2"
                >
                  <img src="/icons/quiz.svg" alt="" className="w-4 h-4 sm:w-5 sm:h-5" />
                  Set Quiz
                </button>
              )}

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

      {/* LIVESHARE TAB — host only */}
      {activeTab === 'liveshare' && isHost && (
        <div className="p-4 space-y-4">
          <div className="bg-[#D9D9D9]/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <img src="/icons/LiveIcon.svg" alt="Live" className="h-10 w-10" />
              <h3 className="text-white font-medium text-base">Go Live and Share Screen</h3>
            </div>
            <div className="bg-black rounded-lg p-4 mb-4 flex flex-col items-center relative">
              <p className="text-[#D9D9D9] opacity-25 text-[13px] text-center mb-4">
                Share your screen with others using LiveKit
              </p>
              
              {isScreenSharingActive ? (
                <button
                  onClick={onEndScreenShare}
                  className="w-32 py-2 px-4 rounded-full font-medium text-sm transition-colors bg-red-500/25 hover:bg-red-500/30 text-white"
                >
                  End LiveShare
                </button>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => isLiveKitConnected && setShowLiveShareMenu(!showLiveShareMenu)}
                    disabled={!isLiveKitConnected}
                    className={`w-32 py-2 px-4 rounded-full font-medium text-sm transition-colors ${
                      isLiveKitConnected 
                        ? 'bg-[#444AF7]/25 hover:bg-[#444AF7]/30 text-white cursor-pointer' 
                        : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                    }`}
                    title={!isLiveKitConnected ? 'Connecting to LiveKit...' : 'Start LiveShare'}
                  >
                    {isLiveKitConnected ? 'LiveShare ▼' : 'Connecting...'}
                  </button>
                  
                  {showLiveShareMenu && (
                    <div className="absolute top-full mt-2 left-0 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden z-50">
                      <button
                        onClick={() => {
                          onStartScreenShare('screen');
                          setShowLiveShareMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-white hover:bg-gray-700 transition-colors text-sm"
                      >
                        🖥️ Screen Share Only
                      </button>
                      <button
                        onClick={() => {
                          // ✅ Cleanup preview stream before starting camera LiveShare
                          if (currentPreviewStreamRef.current) {
                            console.log('🧹 [LeftSidebar] Cleaning up preview stream before camera LiveShare');
                            currentPreviewStreamRef.current.getTracks().forEach(track => track.stop());
                            currentPreviewStreamRef.current = null;
                          }
                          onStartScreenShare('camera', 'liveshare');
                          setShowLiveShareMenu(false);
                        }}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left text-white hover:bg-gray-700 transition-colors text-xs sm:text-sm border-t border-gray-700"
                      >
                        📹 Camera Only
                      </button>
                      <button
                        onClick={() => {
                          // ✅ Cleanup preview stream before starting screen + camera LiveShare
                          if (currentPreviewStreamRef.current) {
                            console.log('🧹 [LeftSidebar] Cleaning up preview stream before screen+camera LiveShare');
                            currentPreviewStreamRef.current.getTracks().forEach(track => track.stop());
                            currentPreviewStreamRef.current = null;
                          }
                          onStartScreenShare('both', 'liveshare');
                          setShowLiveShareMenu(false);
                        }}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left text-white hover:bg-gray-700 transition-colors text-xs sm:text-sm border-t border-gray-700"
                      >
                        🎬 Screen + Camera
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ✅ Session Title Editor */}
          <div className="bg-[#D9D9D9]/20 rounded-xl p-3 sm:p-4 mt-3 sm:mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white text-xs sm:text-sm font-medium">Session Title</span>
            </div>
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <>
                  <input
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    onKeyDown={handleTitleKeyPress}
                    placeholder="Enter session title..."
                    className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
                    title="Save title"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg text-xs sm:text-sm min-h-[34px] sm:min-h-[38px] flex items-center">
                    {sessionTitle || <span className="text-gray-500">Live sharing screen</span>}
                  </div>
                  <button
                    onClick={handleEditTitle}
                    className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                    title="Edit title"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WATCH FROM TAB — host only */}
      {activeTab === 'watchfrom' && isHost && (
        <div className="p-3 sm:p-4 h-full flex flex-col">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Watch From Platform</h3>

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
              <span className="text-white text-xs sm:text-sm font-medium">Session Title</span>
            </div>
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <>
                  <input
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    onKeyDown={handleTitleKeyPress}
                    placeholder="What are you watching? (e.g., Movie Night, Anime)"
                    className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
                    title="Save title"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 px-3 py-2 bg-gray-800 text-white rounded-lg text-xs sm:text-sm min-h-[34px] sm:min-h-[38px] flex items-center">
                    {sessionTitle || (
                      <span className="text-gray-500 truncate">
                        {selectedPlatform ? `Watching ${selectedPlatform.name}` : 'Watching...'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleEditTitle}
                    className="p-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                    title="Edit title"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
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
            <button type="submit" className="mt-2 w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-xs sm:text-sm font-medium">
              Go →
            </button>
          </form>

          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
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
                By uploading content to WeWatch, you agree that:
              </p>
              <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
                <li>You own the rights to this content OR have permission to share it</li>
                <li>You will NOT upload copyrighted movies, TV shows, or other protected content</li>
                <li>You are responsible for any copyright violations</li>
                <li>WeWatch may remove content that violates copyright laws</li>
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
    </div>
  );
}