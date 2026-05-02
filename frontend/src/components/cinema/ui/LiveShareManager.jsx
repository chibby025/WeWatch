// src/components/cinema/ui/LiveShareManager.jsx
// LiveShare Mode Manager - Handles all LiveShare modes (Regular, Screen, Camera, Both, Podcast)

import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  Video, 
  Monitor, 
  Camera, 
  Mic, 
  Users, 
  X, 
  Upload,
  Image as ImageIcon,
  ChevronDown,
  Newspaper,
  Clapperboard,
  UserCircle,
  AlertCircle,
  PauseCircle,
  Radio
} from 'lucide-react';
import LiveShareLayoutSelector from './LiveShareLayoutSelector';
import LiveShareWizard from '../../liveshare/LiveShareWizard';
import GuestInvitationPopup from '../../liveshare/GuestInvitationPopup';
import InSessionAdPanel from '../../ads/InSessionAdPanel';
import BibleControl from '../../liveshare/BibleControl';
import { calculateAge } from '../../../utils/ageUtils';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// ✅ Auto-layout calculation based on stream count
// Note: When guest is selected, host cannot use 'both' (screen+camera) since split-view only supports 2 streams
function calculateAutoLayout(hostShareType, guestShareType) {
  let streamCount = 0;
  
  // Count host streams
  if (hostShareType === 'both') {
    streamCount += 2; // camera + screen
  } else if (hostShareType === 'camera' || hostShareType === 'screen') {
    streamCount += 1;
  }
  
  // Count guest streams (guests can only share camera OR screen, not both)
  if (guestShareType === 'camera' || guestShareType === 'screen') {
    streamCount += 1;
  }
  
  console.log(`🎨 [Auto-Layout] Total streams: ${streamCount} (host: ${hostShareType}, guest: ${guestShareType})`);
  
  // Auto-select layout based on stream count
  if (streamCount === 2) {
    return 'split-view'; // 2 streams (e.g., host camera + guest camera)
  } else if (streamCount === 1) {
    // Single stream - determine type
    if (hostShareType === 'screen') {
      return 'screen-share';
    } else {
      return 'solo-view';
    }
  }
  
  return 'solo-view'; // Fallback
}

// ✅ Smart default layout when guest leaves (returns to host-only layout)
function calculateHostOnlyLayout(hostShareType) {
  if (hostShareType === 'both') {
    return 'split-view'; // Camera + screen side by side
  } else if (hostShareType === 'screen') {
    return 'screen-share'; // Screen with optional PIP camera
  } else if (hostShareType === 'camera') {
    return 'solo-view'; // Camera only
  }
  
  return 'solo-view'; // Fallback
}

export default function LiveShareManager({
  // Session data
  sessionId,
  watchSessionMembers = [],
  currentUser,
  isHost,
  watchType, // 'video', '3d_cinema', or 'classroom'
  
  // Current state
  liveShareMode,
  liveShareContentMode, // 'regular', 'podcast', 'news', 'show'
  podcastConfig,
  liveShareGuest,
  hasLiveSharePermission,
  
  // Handlers
  onLiveShareModeSelect,
  onLiveShareTypeSelect,
  onGrantLiveSharePermission,
  onRevokeLiveSharePermission,
  onKickLiveShareGuest,
  onStartScreenShare,
  onCameraPreview,
  sendMessage, // WebSocket message sender
  cameraShareTrackRef, // ✅ Ref to LiveKit camera track for mute/unmute during breaks
  graphicsRendererRef, // ✅ Ref to GraphicsRenderer for break screen overlay
  onWizardStateChange, // ✅ Callback to notify parent when wizard opens/closes
  availableCameras = [], // 📹 NEW: Available camera devices
  selectedCameraId = null, // 📹 NEW: Currently selected camera
  onCameraSwitch = null, // 📹 NEW: Callback to switch camera
}) {
  // Modal state - now using unified wizard
  const [showLiveShareWizard, setShowLiveShareWizard] = useState(false);
  
  // ✅ Guest invitation state (simplified flow)
  const [showGuestInvitation, setShowGuestInvitation] = useState(false);
  const [guestInvitationData, setGuestInvitationData] = useState(null);
  const [previousLayoutBeforeGuest, setPreviousLayoutBeforeGuest] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [guestShareType, setGuestShareType] = useState(null);
  const [showGuestSwitchType, setShowGuestSwitchType] = useState(false);
  
  // ✅ Pass modal state to parent to prevent taskbar from showing
  useEffect(() => {
    if (onWizardStateChange && typeof onWizardStateChange === 'function') {
      onWizardStateChange(showLiveShareWizard || showGuestInvitation || showGuestSwitchType);
    }
  }, [showLiveShareWizard, showGuestInvitation, showGuestSwitchType, onWizardStateChange]);

  // ✅ Cleanup studio controls when LiveShare ends (mode changes from active → null)
  useEffect(() => {
    console.log('🔍 [LiveShareManager] Cleanup check - liveShareMode:', liveShareMode);
    
    if (!liveShareMode) {
      console.log('🧹 [LiveShareManager] LiveShare ended - starting cleanup');
      
      // Check what's in localStorage before clearing
      const storageKeys = [
        `liveshare_lower_third_name_${sessionId}`,
        `liveshare_lower_third_title_${sessionId}`,
        `liveshare_ticker_text_${sessionId}`,
        `liveshare_ticker_items_${sessionId}`,
        `liveshare_banner_text_${sessionId}`,
        `podcast_logo_style_${sessionId}`
      ];
      
      console.log('📦 [BEFORE CLEANUP] localStorage values:', 
        storageKeys.reduce((acc, key) => {
          const value = localStorage.getItem(key);
          if (value) acc[key.split('_').pop()] = value;
          return acc;
        }, {})
      );
      
      // Clear all React state
      setLowerThirdName('');
      setLowerThirdTitle('');
      setLowerThirdActive(false);
      setLogoBugFile(null);
      setLogoBugPreview(null);
      setLogoBugActive(false);
      setMediaQueue([]);
      setTickerText('');
      setTickerActive(false);
      setTickerItems([]);
      setBannerText('');
      setBannerActive(false);
      setSelectedBreakMedia([]);
      setIsOnBreak(false);
      setBreakStartTime(null);
      setBreakTimeRemaining(0);
      setBreakCustomImage(null);
      setBreakCustomImagePreview(null);
      setPodcastTitle('');
      setPodcastLogo(null);
      setPodcastLogoPreview(null);
      setSelectedGuest(null);
      
      // Clear localStorage for this session
      storageKeys.forEach(key => localStorage.removeItem(key));
      
      // Verify localStorage is cleared
      console.log('🗑️ [AFTER CLEANUP] localStorage values:', 
        storageKeys.reduce((acc, key) => {
          const value = localStorage.getItem(key);
          if (value) acc[key.split('_').pop()] = value;
          return acc;
        }, {})
      );
      
      // Remove any active graphics layers from LiveShareManager
      if (graphicsRendererRef?.current) {
        graphicsRendererRef.current.removeLayer('lower_third');
        graphicsRendererRef.current.removeLayer('logo_bug');
        graphicsRendererRef.current.removeLayer('media_queue');
        graphicsRendererRef.current.removeLayer('ticker');
        graphicsRendererRef.current.removeLayer('banner');
        graphicsRendererRef.current.removeLayer('break_screen');
        graphicsRendererRef.current.render();
        console.log('🎨 [CLEANUP] Graphics layers removed');
      }
      
      console.log('✅ [CLEANUP COMPLETE] Studio controls reset');
    }
  }, [liveShareMode, sessionId, graphicsRendererRef]);

  // ✅ Detect when guest stops sharing and notify host
  useEffect(() => {
    // Only run for guests who were previously sharing
    if (isGuest && guestShareType && !liveShareContentMode) {
      console.log('👋 [LiveShareManager GUEST] Guest stopped sharing - notifying host');
      
      // Calculate smart default layout for host
      const hostShareType = liveShareMode || 'camera';
      const defaultLayout = calculateHostOnlyLayout(hostShareType);
      
      console.log('🎨 [LiveShareManager GUEST] Suggesting default layout:', defaultLayout);
      
      // Notify host that guest left
      if (sendMessage) {
        sendMessage({
          type: 'liveshare_guest_left',
          data: {
            defaultLayout: defaultLayout
          }
        });
      }
      
      // Reset guest state
      setIsGuest(false);
      setGuestShareType(null);
      
      console.log('✅ [LiveShareManager GUEST] Guest state cleared');
    }
  }, [liveShareContentMode, isGuest, guestShareType, liveShareMode, sendMessage]);

  // Legacy modal states (kept for backward compatibility with existing code)
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showLayoutSelector, setShowLayoutSelector] = useState(false);
  const [showPodcastSetup, setShowPodcastSetup] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedShareType, setSelectedShareType] = useState(null);
  
  // Podcast state
  const [podcastTitle, setPodcastTitle] = useState('');
  const [podcastLogo, setPodcastLogo] = useState(null);
  const [podcastLogoPreview, setPodcastLogoPreview] = useState(null);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const logoInputRef = useRef(null);
  
  // Title styling state
  const [titleColor, setTitleColor] = useState('#FFFFFF');
  const [titleSize, setTitleSize] = useState(24);
  const [titleWeight, setTitleWeight] = useState(700);
  const [titleCase, setTitleCase] = useState('none'); // 'none', 'title', 'upper', 'lower', 'sentence'
  const [showTitleStyling, setShowTitleStyling] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Logo styling state
  const [logoSize, setLogoSize] = useState(100); // Size in pixels (50-300)
  const [logoX, setLogoX] = useState(10); // X position from left (0-200)
  const [logoY, setLogoY] = useState(80); // Y position from bottom (0-500)
  
  // Graphics controls state (Phase 1) - Always show when LiveShare is active
  const [showGraphicsControls, setShowGraphicsControls] = useState(true);
  const [lowerThirdName, setLowerThirdName] = useState(() => {
    return localStorage.getItem(`liveshare_lower_third_name_${sessionId}`) || '';
  });
  const [lowerThirdTitle, setLowerThirdTitle] = useState(() => {
    return localStorage.getItem(`liveshare_lower_third_title_${sessionId}`) || '';
  });
  const [lowerThirdActive, setLowerThirdActive] = useState(false);
  const [logoBugFile, setLogoBugFile] = useState(null);
  const [logoBugPreview, setLogoBugPreview] = useState(null);
  const [logoBugActive, setLogoBugActive] = useState(false);
  const logoBugInputRef = useRef(null);
  
  // Media queue state (Phase 1)
  const [mediaQueue, setMediaQueue] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaQueueInputRef = useRef(null);
  const MAX_QUEUE_ITEMS = 5;
  
  // Ticker state (Phase 2)
  const [tickerText, setTickerText] = useState(() => {
    return localStorage.getItem(`liveshare_ticker_text_${sessionId}`) || '';
  });
  const [tickerActive, setTickerActive] = useState(false);
  const [tickerItems, setTickerItems] = useState(() => {
    const saved = localStorage.getItem(`liveshare_ticker_items_${sessionId}`);
    return saved ? JSON.parse(saved) : [];
  });
  
  // Banner state (Phase 2)
  const [bannerText, setBannerText] = useState(() => {
    // Load persisted banner text from localStorage
    return localStorage.getItem(`liveshare_banner_text_${sessionId}`) || '';
  });
  const [bannerActive, setBannerActive] = useState(false);
  const [bannerLayout, setBannerLayout] = useState(() => {
    // Load persisted layout choice: 'bn' (BN.png on right) or 'breakin' (Breakin.png on top-left)
    return localStorage.getItem('liveshare_banner_layout') || 'bn';
  });
  
  // Bible verse state (Church mode)
  const [currentBibleVerse, setCurrentBibleVerse] = useState(null);
  
  // Media queue break options
  const [breakMediaMode, setBreakMediaMode] = useState('one'); // 'one' or 'all'
  const [selectedBreakMedia, setSelectedBreakMedia] = useState([]);
  
  // Individual graphic colors
  const [lowerThirdColors, setLowerThirdColors] = useState({
    background: '#0052A5',
    accent: '#DC2626'
  });
  const [tickerColor, setTickerColor] = useState('#DC2626');
  const [timeBoxColor, setTimeBoxColor] = useState(() => {
    return localStorage.getItem('liveshare_ticker_timebox_color') || '#1A1A2E';
  });
  const [bannerColor, setBannerColor] = useState('#DC2626');
  const [bannerTextColor, setBannerTextColor] = useState('#FFFFFF'); // Default white text
  
  // Color picker popover states
  const [showLowerThirdColorPicker, setShowLowerThirdColorPicker] = useState(false);
  const [showTickerColorPicker, setShowTickerColorPicker] = useState(false);
  const [showTimeBoxColorPicker, setShowTimeBoxColorPicker] = useState(false);
  const [showBannerColorPicker, setShowBannerColorPicker] = useState(false);
  const [showBannerTextColorPicker, setShowBannerTextColorPicker] = useState(false);
  
  // Break mode state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakScreenSource, setBreakScreenSource] = useState(() => {
    return localStorage.getItem('liveshare_break_screen_source') || 'static'; // 'static', 'media', 'upload', 'animation'
  });
  const [breakDuration, setBreakDuration] = useState(() => {
    return parseInt(localStorage.getItem('liveshare_break_duration') || '5', 10);
  });
  const [breakStartTime, setBreakStartTime] = useState(null);
  const [breakTimeRemaining, setBreakTimeRemaining] = useState(0);
  const [breakKeepAudio, setBreakKeepAudio] = useState(() => {
    return localStorage.getItem('liveshare_break_keep_audio') === 'true';
  });
  const [breakTurnOffCamera, setBreakTurnOffCamera] = useState(() => {
    return localStorage.getItem('liveshare_break_turn_off_camera') === 'true';
  });
  const [breakCustomImage, setBreakCustomImage] = useState(null);
  const [breakCustomImagePreview, setBreakCustomImagePreview] = useState(null);
  const breakImageInputRef = useRef(null);
  
  // Break screen ad state
  const [breakAdData, setBreakAdData] = useState(null);
  const [fetchingBreakAd, setFetchingBreakAd] = useState(false);
  
  // Color presets
  const colorPresets = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Yellow', value: '#FBBF24' },
    { name: 'Orange', value: '#FB923C' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Purple', value: '#A855F7' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Cyan', value: '#06B6D4' },
    { name: 'Green', value: '#10B981' },
  ];

  // Studio Controls visibility mapping per LiveShare mode
  const modeControlsMap = {
    regular: {
      takeABreak: false,    // No breaks for basic streaming
      graphics: true,
      lowerThird: true,
      logoBug: true,
      mediaQueue: false,
      ticker: false,
      banner: false,
    },
    podcast: {
      takeABreak: true,
      graphics: true,
      lowerThird: true,     // For guest names/titles
      logoBug: true,        // For show branding
      mediaQueue: true,     // For ads, promos, or visual aids
      ticker: false,
      banner: false,
    },
    news: {
      takeABreak: true,
      graphics: true,
      lowerThird: true,     // For correspondent names
      logoBug: true,        // For network branding
      mediaQueue: true,     // For breaking footage, graphics
      ticker: true,         // For headlines ticker
      banner: true,         // For breaking news banners
    },
    show: {
      takeABreak: true,
      graphics: true,
      lowerThird: true,
      logoBug: true,
      mediaQueue: true,     // Focus on visual media and graphics
      ticker: false,        // Shows don't need news tickers
      banner: false,        // Shows don't need breaking news
    },
    standup: {
      takeABreak: true,
      graphics: false,      // Minimal graphics for standup comedy
      lowerThird: false,
      logoBug: true,        // Just branding
      mediaQueue: false,
      ticker: false,
      banner: false,
    },
  };

  // Helper function to check if control should be visible
  const shouldShowControl = (controlName) => {
    if (!liveShareContentMode || !modeControlsMap[liveShareContentMode]) {
      // console.log(`🎛️ [StudioControls] ${controlName}: mode not set (${liveShareContentMode}), showing all`);
      return true; // Show all if mode not set or unknown
    }
    const shouldShow = modeControlsMap[liveShareContentMode][controlName] === true;
    // console.log(`🎛️ [StudioControls] ${controlName}: mode=${liveShareContentMode}, show=${shouldShow}`);
    return shouldShow;
  };

  // Available modes
  const modes = [
    {
      id: 'regular',
      name: 'Regular',
      icon: Video,
      color: 'blue'
    },
    {
      id: 'podcast',
      name: 'Podcast',
      icon: Mic,
      color: 'purple',
      requiresSetup: true
    },
    {
      id: 'news',
      name: 'News',
      icon: Newspaper,
      color: 'red',
      requiresSetup: true
    },
    {
      id: 'show',
      name: 'Show',
      icon: Clapperboard,
      color: 'green',
      requiresSetup: true
    }
  ];

  // Handle mode selection
  const handleModeSelect = (mode) => {
    setSelectedMode(mode.id);
    
    if (mode.requiresSetup) {
      // Podcast, News, or Show - show setup modal
      setShowModeSelector(false);
      setShowPodcastSetup(true);
    } else if (mode.id === 'regular') {
      // Regular - show share type selector
      setShowModeSelector(false);
      setShowTypeSelector(true);
    }
  };

  // Handle type selection (for screen/camera/both modes)
  const handleTypeSelect = (type) => {
    console.log('📋 [LiveShareManager] Type selected:', type, 'Mode:', selectedMode);
    
    // Store selected type for layout selector
    setSelectedShareType(type);
    
    // Show layout selector
    setShowTypeSelector(false);
    setShowLayoutSelector(true);
  };
  
  const handleLayoutSelect = (layoutId) => {
    console.log('📊 [LiveShareManager] Layout selected:', layoutId);
    
    setShowLayoutSelector(false);
    
    // Store layout choice in localStorage for later use
    localStorage.setItem('liveshare_layout', layoutId);
    
    // Set the content mode to 'regular' if not already set by podcast/news/show setup
    if (selectedMode === 'regular' && onLiveShareModeSelect) {
      console.log('🎯 [LiveShareManager] Setting content mode to regular');
      onLiveShareModeSelect('regular', null);
    }
    
    // Proceed with starting LiveShare
    onLiveShareTypeSelect(selectedShareType);
    
    toast.success(`Layout applied`);
  };

  // Text case transformation helper
  const applyTextCase = (text, caseType) => {
    if (!text) return text;
    
    switch (caseType) {
      case 'title':
        // Title Case - capitalize first letter of each word
        return text.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
      case 'upper':
        return text.toUpperCase();
      case 'lower':
        return text.toLowerCase();
      case 'sentence':
        // Sentence case - capitalize first letter only
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
      case 'none':
      default:
        return text;
    }
  };
  
  // Apply preset styles
  const applyPreset = (preset) => {
    if (preset === 'professional') {
      setTitleColor('#FFFFFF');
      setTitleSize(24);
      setTitleWeight(700);
      setTitleCase('title');
    } else if (preset === 'vibrant') {
      setTitleColor('#FBBF24');
      setTitleSize(28);
      setTitleWeight(800);
      setTitleCase('upper');
    } else if (preset === 'minimal') {
      setTitleColor('#D1D5DB');
      setTitleSize(20);
      setTitleWeight(400);
      setTitleCase('none');
    }
  };
  
  // Reset to defaults
  const resetTitleStyle = () => {
    setTitleColor('#FFFFFF');
    setTitleSize(24);
    setTitleWeight(700);
    setTitleCase('none');
    setLogoSize(100);
    setLogoX(10);
    setLogoY(80);
  };
  
  // Handle logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Logo must be less than 2MB');
        return;
      }
      setPodcastLogo(file);
      setPodcastLogoPreview(URL.createObjectURL(file));
    }
  };

  // Handle podcast start
  const handleStartPodcast = async () => {
    if (!podcastTitle.trim()) {
      alert('Please enter an episode title');
      return;
    }
    
    // Guest is now optional - can start solo

    // Upload logo if provided
    let logoUrl = null;
    if (podcastLogo) {
      const formData = new FormData();
      formData.append('logo', podcastLogo);
      
      try {
        const response = await fetch(`/api/sessions/${sessionId}/podcast-logo`, {
          method: 'POST',
          credentials: 'include', // Use cookies instead of Bearer token
          body: formData
        });
        
        if (response.ok) {
          const data = await response.json();
          logoUrl = data.logo_url;
        } else {
          console.error('Failed to upload logo:', response.status, await response.text());
        }
      } catch (err) {
        console.error('Failed to upload logo:', err);
      }
    }
    
    // Call mode selection handler with all config
    if (onLiveShareModeSelect) {
      onLiveShareModeSelect(selectedMode, {
        title: podcastTitle,
        logoUrl,
        titleStyle: {
          color: titleColor,
          size: titleSize,
          weight: titleWeight,
          case: titleCase
        },
        logoStyle: {
          size: logoSize,
          x: logoX,
          y: logoY
        },
        guestId: selectedGuest?.id
      });
    }
    
    setShowPodcastSetup(false);
    setShowTypeSelector(true); // Show type selector to choose camera/screen/both
  };

  // ✅ Handle Wizard Completion
  const handleWizardComplete = async (wizardData) => {
    console.log('🧙 [LiveShareManager] Wizard completed with data:', wizardData);
    console.log('🧙 [LiveShareManager] Setup data breakdown:', {
      hasSetup: !!wizardData.setup,
      setupTitle: wizardData.setup?.title,
      setupHasLogoFile: !!wizardData.setup?.logoFile,
      setupLogoFileName: wizardData.setup?.logoFile?.name,
      setupGuestId: wizardData.setup?.guestId,
      setupTitleStyle: wizardData.setup?.titleStyle,
      setupLogoStyle: wizardData.setup?.logoStyle,
      cameraId: wizardData.cameraId, // 📹 Log selected camera
    });
    
    // 📹 Switch camera if a different one was selected
    if (wizardData.cameraId && wizardData.cameraId !== selectedCameraId && onCameraSwitch) {
      console.log(`📹 [LiveShareManager] Switching camera from ${selectedCameraId} to ${wizardData.cameraId}`);
      try {
        await onCameraSwitch(wizardData.cameraId);
        console.log('✅ [LiveShareManager] Camera switched successfully');
      } catch (error) {
        console.error('❌ [LiveShareManager] Failed to switch camera:', error);
      }
    }
    
    const { mode, setup, shareType, deviceId, layout } = wizardData;
    
    // Store layout preference
    if (layout) {
      localStorage.setItem('liveshare_layout', layout);
    }
    
    // For modes that require setup (podcast, news, show)
    if (setup) {
      console.log('🎙️ [LiveShareManager] Processing setup for mode:', mode);
      // Upload logo if provided
      let logoUrl = null;
      if (setup.logoFile) {
        console.log('📤 [LiveShareManager] Uploading logo file:', setup.logoFile.name);
        const formData = new FormData();
        formData.append('logo', setup.logoFile);
        
        try {
          const response = await fetch(`/api/sessions/${sessionId}/podcast-logo`, {
            method: 'POST',
            credentials: 'include',
            body: formData
          });
          
          if (response.ok) {
            const data = await response.json();
            logoUrl = data.logo_url;
            console.log('✅ [LiveShareManager] Logo uploaded successfully:', logoUrl);
          } else {
            console.error('❌ [LiveShareManager] Logo upload failed:', response.status);
          }
        } catch (err) {
          console.error('❌ [LiveShareManager] Logo upload error:', err);
        }
      } else {
        console.log('ℹ️ [LiveShareManager] No logo file to upload');
      }
      
      // Set the mode with configuration
      const modeConfig = {
        title: setup.title,
        logoUrl,
        titleStyle: setup.titleStyle || {
          color: '#FFFFFF',
          size: 24,
          weight: 700,
          case: 'none'
        },
        logoStyle: setup.logoStyle || {
          size: 100,
          x: 10,
          y: 80
        },
        guestId: setup.guestId
      };
      
      console.log('📦 [LiveShareManager] Calling onLiveShareModeSelect with:', {
        mode,
        config: modeConfig,
        layout
      });
      
      if (onLiveShareModeSelect) {
        onLiveShareModeSelect(mode, modeConfig, layout);
      }
    } else if (mode === 'regular') {
      // Regular mode - just set the mode
      console.log('📺 [LiveShareManager] Setting regular mode (no config), layout:', layout);
      if (onLiveShareModeSelect) {
        onLiveShareModeSelect('regular', null, layout);
      }
    }
    
    // Store share type for layout selector
    setSelectedShareType(shareType);
    
    console.log('🎬 [LiveShareManager] Starting LiveShare with type:', shareType, 'deviceId:', deviceId, 'layout:', layout);
    // Start the actual LiveShare
    onLiveShareTypeSelect(shareType, deviceId, layout);
    
    toast.success('LiveShare started!');
  };
  
  // ✅ Graphics Controls Handlers (Phase 1)
  const handleLogoBugUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 500 * 1024) { // 500KB limit for logo bug
      toast.error('Logo must be less than 500KB');
      return;
    }
    
    setLogoBugFile(file);
    setLogoBugPreview(URL.createObjectURL(file));
    
    // Upload to backend
    const formData = new FormData();
    formData.append('logo', file);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/logo-bug`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success('Logo uploaded successfully');
        
        // Graphics data for both API and WebSocket
        const graphicData = {
          type: 'logo_bug',
          content: { imageUrl: data.logo_url },
          position: 'top-right',
          active: true,
          z_index: 5
        };
        
        // Update graphics state to show logo
        await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(graphicData)
        });
        
        // Broadcast to all viewers via WebSocket
        if (sendMessage) {
          sendMessage({
            type: 'liveshare_graphics_update',
            data: { graphic: graphicData }
          });
        }
        
        setLogoBugActive(true);
        console.log('🎨 [LiveShareManager] Logo bug update broadcast:', graphicData);
      } else {
        toast.error('Failed to upload logo');
      }
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error('Failed to upload logo');
    }
  };
  
  const handleMediaQueueUpload = async (e) => {
    const files = Array.from(e.target.files);
    console.log('📤 [MediaQueue] Upload started:', { fileCount: files.length, currentQueue: mediaQueue.length });
    
    if (mediaQueue.length + files.length > MAX_QUEUE_ITEMS) {
      toast.error(`Maximum ${MAX_QUEUE_ITEMS} items allowed in queue`);
      return;
    }
    
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
      console.log('📤 [MediaQueue] Uploading file:', { name: file.name, type: file.type, size: `${(file.size / 1024 / 1024).toFixed(2)}MB`, isImage });
      
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large. Max: ${isImage ? '5MB' : '20MB'}`);
        continue;
      }
      
      // Upload to backend
      const formData = new FormData();
      formData.append('media', file);
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/media-queue`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
        
        if (response.ok) {
          const queueItem = await response.json();
          console.log('✅ [MediaQueue] Upload successful:', { itemId: queueItem.id, fileName: file.name, mediaUrl: queueItem.media_url });
          setMediaQueue(prev => [...prev, {
            ...queueItem,
            file,
            preview: URL.createObjectURL(file)
          }]);
          toast.success(`${file.name} added to queue`);
        } else {
          // Get error message from backend
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('❌ [MediaQueue] Upload failed:', {
            status: response.status,
            error: errorData.error || errorData.message,
            sessionId,
            fileName: file.name
          });
          toast.error(`Failed to upload ${file.name}: ${errorData.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Media upload error:', error);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  };
  
  const handlePlayMedia = (itemId) => {
    const mediaItem = mediaQueue.find(item => item.id === itemId);
    if (!mediaItem) {
      console.error('❌ [MediaQueue] Item not found:', itemId);
      return;
    }
    
    console.log('▶️ [MediaQueue] Playing media:', { itemId, fileName: mediaItem.file_name, mediaType: mediaItem.media_type, mediaUrl: mediaItem.media_url });
    
    // Graphics data for media queue display
    const graphicData = {
      type: 'media_queue',
      content: { 
        mediaUrl: mediaItem.media_url,
        mediaType: mediaItem.media_type,
        itemId: itemId
      },
      position: 'center',
      active: true,
      z_index: 8
    };
    
    // ✅ Apply to host's local GraphicsRenderer FIRST (since WebSocket won't echo back)
    if (graphicsRendererRef?.current) {
      console.log('🎨 [MediaQueue] Adding to local GraphicsRenderer');
      graphicsRendererRef.current.addLayer('media_queue', graphicData);
      graphicsRendererRef.current.render();
      console.log('✅ [MediaQueue] Local graphics updated');
    }
    
    // Broadcast to all viewers via WebSocket
    if (sendMessage) {
      console.log('📡 [MediaQueue] Broadcasting to viewers...');
      sendMessage({
        type: 'liveshare_graphics_update',
        data: { graphic: graphicData }
      });
    }
    
    // Update local state
    setMediaQueue(prev => prev.map(item => 
      item.id === itemId ? { ...item, status: 'played' } : item
    ));
    
    console.log('✅ [MediaQueue] Broadcast complete, graphic data:', graphicData);
  };
  
  const handleAddTickerItem = () => {
    if (!tickerText.trim()) {
      toast.error('Please enter ticker text');
      return;
    }
    
    const newItems = [...tickerItems, tickerText];
    setTickerItems(newItems);
    localStorage.setItem(`liveshare_ticker_items_${sessionId}`, JSON.stringify(newItems));
    setTickerText('');
    localStorage.setItem(`liveshare_ticker_text_${sessionId}`, '');
    
    // Graphics data for ticker
    const graphicData = {
      type: 'ticker',
      content: { 
        items: newItems,
        style: { 
          bgColor: tickerColor,
          timeBoxColor: timeBoxColor
        }
      },
      position: 'bottom',
      active: true,
      z_index: 9
    };
    
    // Save to backend
    fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graphicData)
    }).catch(err => console.error('Ticker save error:', err));
    
    // Broadcast via WebSocket
    if (sendMessage) {
      sendMessage({
        type: 'liveshare_graphics_update',
        data: { graphic: graphicData }
      });
    }
    
    toast.success('Ticker item added');
    console.log('🎨 [LiveShareManager] Ticker update broadcast:', graphicData);
  };
  
  const handleToggleTicker = () => {
    const newActive = !tickerActive;
    setTickerActive(newActive);
    
    const graphicData = {
      type: 'ticker',
      content: { 
        items: tickerItems,
        style: { 
          bgColor: tickerColor,
          timeBoxColor: timeBoxColor
        }
      },
      position: 'bottom',
      active: newActive,
      z_index: 9
    };
    
    // Save to backend
    fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graphicData)
    }).catch(err => console.error('Ticker toggle error:', err));
    
    // Broadcast via WebSocket
    if (sendMessage) {
      sendMessage({
        type: 'liveshare_graphics_update',
        data: { graphic: graphicData }
      });
    }
    
    console.log('🎨 [LiveShareManager] Ticker toggle broadcast:', graphicData);
  };
  
  const handleToggleBanner = () => {
    if (!bannerText.trim() && !bannerActive) {
      toast.error('Please enter banner text');
      return;
    }
    
    const newActive = !bannerActive;
    setBannerActive(newActive);
    
    // Get podcast logo position and size from localStorage
    let podcastLogoSize = 100;
    let podcastLogoX = 10;
    let podcastLogoY = 80;
    try {
      const savedLogoStyles = localStorage.getItem(`podcast_logo_style_${sessionId}`);
      if (savedLogoStyles) {
        const styles = JSON.parse(savedLogoStyles);
        podcastLogoSize = styles.size || 100;
        podcastLogoX = styles.x || 10;
        podcastLogoY = styles.y || 80;
      }
    } catch (err) {
      console.warn('Failed to load podcast logo styles:', err);
    }
    
    const graphicData = {
      type: 'banner',
      content: { 
        text: bannerText,
        style: { 
          bgColor: bannerColor,
          textColor: bannerTextColor // Add text color
        },
        logoUrl: podcastConfig?.logoUrl || logoBugPreview,
        podcastLogoSize, // Pass podcast logo dimensions
        podcastLogoX,
        podcastLogoY,
        layout: bannerLayout // 'bn' or 'breakin'
      },
      position: 'bottom',
      active: newActive,
      z_index: 11
    };
    
    console.log('🎨 [LiveShareManager] Banner data:', {
      text: bannerText,
      bgColor: bannerColor,
      logoUrl: podcastConfig?.logoUrl || logoBugPreview,
      podcastLogoSize,
      podcastLogoY,
      layout: bannerLayout,
      podcastConfigAvailable: !!podcastConfig,
      logoBugPreviewAvailable: !!logoBugPreview
    });
    
    // Save to backend
    fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graphicData)
    }).catch(err => console.error('Banner toggle error:', err));
    
    // Broadcast via WebSocket
    if (sendMessage) {
      sendMessage({
        type: 'liveshare_graphics_update',
        data: { graphic: graphicData }
      });
    }
    
    toast.success(newActive ? 'Banner activated' : 'Banner hidden');
    console.log('🎨 [LiveShareManager] Banner toggle broadcast:', graphicData);
  };
  
  // Bible verse handlers (Church mode)
  const handleShowBibleVerse = (verseData) => {
    console.log('📖 [Bible] Showing verse:', verseData);
    setCurrentBibleVerse(verseData);
    
    // Broadcast via WebSocket
    if (sendMessage) {
      sendMessage({
        type: 'bible_verse_update',
        data: { 
          verse: verseData,
          active: true
        }
      });
    }
    
    // Save to backend (persist current verse)
    fetch(`${API_BASE_URL}/api/sessions/${sessionId}/bible-verse`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verse: verseData })
    }).catch(err => console.error('Bible verse save error:', err));
    
    toast.success(`Displaying ${verseData.reference}`);
  };
  
  const handleHideBibleVerse = () => {
    console.log('📖 [Bible] Hiding verse');
    setCurrentBibleVerse(null);
    
    // Broadcast via WebSocket
    if (sendMessage) {
      sendMessage({
        type: 'bible_verse_update',
        data: { 
          verse: null,
          active: false
        }
      });
    }
    
    // Clear from backend
    fetch(`${API_BASE_URL}/api/sessions/${sessionId}/bible-verse`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(err => console.error('Bible verse clear error:', err));
    
    toast.success('Bible verse hidden');
  };
  
  const handleStopMedia = () => {
    console.log('⏹️ [MediaQueue] Stopping media overlay');
    
    // Remove from host's local GraphicsRenderer
    if (graphicsRendererRef?.current) {
      console.log('🎨 [MediaQueue] Removing from local GraphicsRenderer');
      graphicsRendererRef.current.removeLayer('media_queue');
      graphicsRendererRef.current.render();
      console.log('✅ [MediaQueue] Local overlay removed');
    }
    
    // Broadcast removal to viewers
    if (sendMessage) {
      console.log('📡 [MediaQueue] Broadcasting overlay removal to viewers...');
      sendMessage({
        type: 'liveshare_graphics_update',
        data: { 
          graphic: {
            type: 'media_queue',
            active: false // Inactive = remove layer
          }
        }
      });
    }
    
    toast.success('Media overlay removed');
  };
  
  const handleDeleteMedia = async (itemId) => {
    try {
      // Check if this item is currently displaying
      const itemToDelete = mediaQueue.find(item => item.id === itemId);
      const isCurrentlyPlaying = itemToDelete?.status === 'played';
      
      console.log('🗑️ [MediaQueue] Deleting item:', { itemId, isCurrentlyPlaying });
      
      // If currently displaying, stop the overlay first
      if (isCurrentlyPlaying) {
        console.log('⏹️ [MediaQueue] Item is currently playing, stopping overlay...');
        handleStopMedia();
      }
      
      const response = await fetch(`${API_BASE_URL}/api/sessions/media-queue/${itemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        setMediaQueue(prev => prev.filter(item => item.id !== itemId));
        toast.success('Media removed from queue');
        console.log('✅ [MediaQueue] Item deleted from queue');
      } else {
        toast.error('Failed to delete media');
      }
    } catch (error) {
      console.error('Delete media error:', error);
      toast.error('Failed to delete media');
    }
  };
  
  const handleToggleLowerThird = async () => {
    const newActive = !lowerThirdActive;
    setLowerThirdActive(newActive);
    
    const graphicData = {
      type: 'lower_third',
      content: {
        name: lowerThirdName,
        title: lowerThirdTitle,
        style: {
          bgColor: lowerThirdColors.background,
          accentBar: lowerThirdColors.accent
        }
      },
      position: 'bottom-left',
      active: newActive,
      z_index: 10
    };
    
    try {
      // Save to database via REST API
      await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphicData)
      });
      
      // Broadcast to all viewers via WebSocket
      if (sendMessage) {
        sendMessage({
          type: 'liveshare_graphics_update',
          data: { graphic: graphicData }
        });
      }
      
      console.log('🎨 [LiveShareManager] Lower third update broadcast:', graphicData);
    } catch (error) {
      console.error('Lower third update error:', error);
      toast.error('Failed to update lower third');
    }
  };
  
  // Color change handlers that re-broadcast graphics
  const handleTickerColorChange = (newColor) => {
    console.log('🎨 [LiveShareManager] Ticker color changed to:', newColor);
    console.log('🎨 [LiveShareManager] Ticker active:', tickerActive, 'Items:', tickerItems);
    setTickerColor(newColor);
    
    // If ticker is active, re-broadcast with new color
    if (tickerActive && tickerItems.length > 0) {
      const graphicData = {
        type: 'ticker',
        content: { 
          items: tickerItems,
          style: { 
            bgColor: newColor,
            timeBoxColor: timeBoxColor // Include time box color
          }
        },
        position: 'bottom',
        active: true,
        z_index: 9
      };
      
      console.log('🎨 [LiveShareManager] Broadcasting ticker with new color:', graphicData);
      
      fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphicData)
      }).catch(err => console.error('Ticker color update error:', err));
      
      if (sendMessage) {
        sendMessage({
          type: 'liveshare_graphics_update',
          data: { graphic: graphicData }
        });
      }
    } else {
      console.log('🎨 [LiveShareManager] Not broadcasting - ticker not active or no items');
    }
  };
  
  const handleTimeBoxColorChange = (newColor) => {
    console.log('🎨 [LiveShareManager] Time box color changed to:', newColor);
    setTimeBoxColor(newColor);
    localStorage.setItem('liveshare_ticker_timebox_color', newColor);
    
    // If ticker is active, re-broadcast with new time box color
    if (tickerActive && tickerItems.length > 0) {
      const graphicData = {
        type: 'ticker',
        content: { 
          items: tickerItems,
          style: { 
            bgColor: tickerColor,
            timeBoxColor: newColor
          }
        },
        position: 'bottom',
        active: true,
        z_index: 9
      };
      
      console.log('🎨 [LiveShareManager] Broadcasting ticker with new time box color:', graphicData);
      
      fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphicData)
      }).catch(err => console.error('Time box color update error:', err));
      
      if (sendMessage) {
        sendMessage({
          type: 'liveshare_graphics_update',
          data: { graphic: graphicData }
        });
      }
    }
  };
  
  const handleBannerColorChange = (newColor) => {
    console.log('🎨 [LiveShareManager] Banner color changed to:', newColor);
    console.log('🎨 [LiveShareManager] Banner active:', bannerActive, 'Text:', bannerText);
    setBannerColor(newColor);
    
    // If banner is active, re-broadcast with new color
    if (bannerActive && bannerText.trim()) {
      // Get podcast logo position and size from localStorage
      let podcastLogoSize = 100;
      let podcastLogoX = 10;
      let podcastLogoY = 80;
      try {
        const savedLogoStyles = localStorage.getItem(`podcast_logo_style_${sessionId}`);
        if (savedLogoStyles) {
          const styles = JSON.parse(savedLogoStyles);
          podcastLogoSize = styles.size || 100;
          podcastLogoX = styles.x || 10;
          podcastLogoY = styles.y || 80;
        }
      } catch (err) {
        console.warn('Failed to load podcast logo styles:', err);
      }
      
      const graphicData = {
        type: 'banner',
        content: { 
          text: bannerText,
          style: { bgColor: newColor },
          logoUrl: podcastConfig?.logoUrl || logoBugPreview,
          podcastLogoSize,
          podcastLogoX,
          podcastLogoY,
          layout: bannerLayout
        },
        position: 'bottom',
        active: true,
        z_index: 11
      };
      
      console.log('🎨 [LiveShareManager] Broadcasting banner with new color:', graphicData);
      
      fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphicData)
      }).catch(err => console.error('Banner color update error:', err));
      
      if (sendMessage) {
        sendMessage({
          type: 'liveshare_graphics_update',
          data: { graphic: graphicData }
        });
      }
    } else {
      console.log('🎨 [LiveShareManager] Not broadcasting - banner not active or no text');
    }
  };
  
  const handleBannerTextColorChange = (newColor) => {
    console.log('🎨 [LiveShareManager] Banner text color changed to:', newColor);
    console.log('🎨 [LiveShareManager] Banner active:', bannerActive, 'Text:', bannerText);
    setBannerTextColor(newColor);
    
    // If banner is active, re-broadcast with new text color
    if (bannerActive && bannerText.trim()) {
      // Get podcast logo position and size from localStorage
      let podcastLogoSize = 100;
      let podcastLogoX = 10;
      let podcastLogoY = 80;
      try {
        const savedLogoStyles = localStorage.getItem(`podcast_logo_style_${sessionId}`);
        if (savedLogoStyles) {
          const styles = JSON.parse(savedLogoStyles);
          podcastLogoSize = styles.size || 100;
          podcastLogoX = styles.x || 10;
          podcastLogoY = styles.y || 80;
        }
      } catch (err) {
        console.warn('Failed to load podcast logo styles:', err);
      }
      
      const graphicData = {
        type: 'banner',
        content: { 
          text: bannerText,
          style: { 
            bgColor: bannerColor,
            textColor: newColor // Use the new color immediately
          },
          layout: bannerLayout,
          podcastLogo: {
            size: podcastLogoSize,
            x: podcastLogoX,
            y: podcastLogoY
          }
        },
        position: 'bottom',
        active: true,
        z_index: 11
      };
      
      console.log('🎨 [LiveShareManager] Broadcasting banner with new text color:', graphicData);
      
      fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphicData)
      }).catch(err => console.error('Banner text color update error:', err));
      
      if (sendMessage) {
        sendMessage({
          type: 'liveshare_graphics_update',
          data: { graphic: graphicData }
        });
      }
    } else {
      console.log('🎨 [LiveShareManager] Not broadcasting - banner not active or no text');
    }
  };
  
  // Break mode handlers
  const handleStartBreak = async () => {
    if (!isHost) {
      toast.error('Only the host can start a break');
      return;
    }
    
    // Validate media queue selection if media mode is chosen
    if (breakScreenSource === 'media') {
      if (mediaQueue.length === 0) {
        toast.error('No media in queue. Upload media first.');
        return;
      }
      if (selectedBreakMedia.length === 0) {
        toast.error('Please select at least one media item to play');
        return;
      }
    }
    
    // Fetch video ad if ad break is selected
    if (breakScreenSource === 'ad') {
      setFetchingBreakAd(true);
      try {
        const userAge = currentUser?.date_of_birth ? calculateAge(currentUser.date_of_birth) : null;
        const params = new URLSearchParams({
          user_id: currentUser?.id,
          session_id: sessionId,
          ad_type: 'video',
          placement: 'break_screen'
        });
        
        if (userAge) params.append('user_age', userAge);
        
        const response = await fetch(`${API_BASE_URL}/api/ads/in-session?${params}`);
        const adData = await response.json();
        
        if (!adData.ad) {
          toast.error('No ads available right now. Try another break option.');
          setFetchingBreakAd(false);
          return;
        }
        
        // Store ad data and update duration to match ad
        setBreakAdData(adData.ad);
        setBreakDuration(Math.ceil(adData.ad.duration / 60) || 1); // Convert seconds to minutes
        setFetchingBreakAd(false);
        
        console.log('📺 [LiveShareManager] Fetched break ad:', adData.ad);
      } catch (error) {
        console.error('Failed to fetch break ad:', error);
        toast.error('Failed to load ad. Try another break option.');
        setFetchingBreakAd(false);
        return;
      }
    }
    
    const startTime = Date.now();
    setIsOnBreak(true);
    setBreakStartTime(startTime);
    setBreakTimeRemaining(breakDuration);
    
    // Mute host camera locally BEFORE broadcasting (if turnOffCamera is enabled)
    if (breakTurnOffCamera && cameraShareTrackRef?.current) {
      console.log('📹 [LiveShareManager] Muting HOST camera track');
      cameraShareTrackRef.current.mute()
        .then(() => console.log('✅ [LiveShareManager] Host camera muted successfully'))
        .catch(error => console.error('❌ [LiveShareManager] Failed to mute host camera:', error));
    }
    
    // 🎨 Add break screen to HOST's GraphicsRenderer BEFORE broadcasting
    if (graphicsRendererRef?.current) {
      console.log('🎨 [LiveShareManager] Adding break screen to HOST GraphicsRenderer');
      console.log('🎨 [LiveShareManager] Break screen config:', {
        screenSource: breakScreenSource,
        hasCustomImage: !!breakCustomImagePreview,
        customImageLength: breakCustomImagePreview?.length,
        customImagePrefix: breakCustomImagePreview?.substring(0, 50)
      });
      
      graphicsRendererRef.current.addLayer('break_screen', {
        type: 'break_screen',
        content: {
          screenSource: breakScreenSource,
          customImage: breakCustomImagePreview,
          timeRemaining: breakDuration * 60, // Convert to seconds
          keepAudio: breakKeepAudio,
          // Media queue data
          mediaMode: breakMediaMode,
          mediaItems: breakScreenSource === 'media' 
            ? selectedBreakMedia.map(index => mediaQueue[index])
            : []
        },
        zIndex: 100 // Top layer
      });
      graphicsRendererRef.current.render();
      console.log('✅ [LiveShareManager] Break screen added to host renderer');
    } else {
      console.warn('⚠️ [LiveShareManager] No GraphicsRenderer available for host');
    }
    
    // Broadcast break started
    const breakData = {
      started: true,
      startTime: startTime,
      duration: breakDuration,
      screenSource: breakScreenSource,
      keepAudio: breakKeepAudio,
      turnOffCamera: breakTurnOffCamera,
      customImage: breakCustomImagePreview,
      // Media queue data for viewers
      mediaMode: breakMediaMode,
      mediaItems: breakScreenSource === 'media'
        ? selectedBreakMedia.map(index => mediaQueue[index])
        : [],
      // Ad data for viewers
      adData: breakScreenSource === 'ad' ? breakAdData : null
    };
    
    if (sendMessage) {
      sendMessage({
        type: 'liveshare_break_started',
        data: breakData
      });
    }
    
    // Save to backend
    fetch(`${API_BASE_URL}/api/sessions/${sessionId}/break`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(breakData)
    }).catch(err => console.error('Break start error:', err));
    
    toast.success(`Taking a ${breakDuration}-minute break`, {
      icon: '⏸️',
      duration: 3000
    });
    
    console.log('⏸️ [LiveShareManager] Break started:', breakData);
  };
  
  const handleEndBreak = async () => {
    if (!isHost) {
      toast.error('Only the host can end the break');
      return;
    }
    
    // Track ad impression if ad was shown
    if (breakScreenSource === 'ad' && breakAdData) {
      try {
        await fetch(`${API_BASE_URL}/api/ads/campaigns/${breakAdData.id}/track`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            room_id: parseInt(window.location.pathname.split('/')[2]), // Extract room ID from URL
            clicked: false,
            view_duration: breakAdData.duration || 0
          })
        });
        console.log('✅ [LiveShareManager] Ad impression tracked');
      } catch (error) {
        console.error('Failed to track ad impression:', error);
      }
      
      // Clear ad data
      setBreakAdData(null);
    }
    
    setIsOnBreak(false);
    setBreakStartTime(null);
    setBreakTimeRemaining(0);
    
    // 🎨 Remove break screen from HOST's GraphicsRenderer BEFORE broadcasting
    if (graphicsRendererRef?.current) {
      console.log('🎨 [LiveShareManager] Removing break screen from HOST GraphicsRenderer');
      graphicsRendererRef.current.removeLayer('break_screen');
      graphicsRendererRef.current.render();
      console.log('✅ [LiveShareManager] Break screen removed from host renderer');
    }
    
    // Unmute host camera locally BEFORE broadcasting (if it was muted)
    if (breakTurnOffCamera && cameraShareTrackRef?.current) {
      console.log('📹 [LiveShareManager] Unmuting HOST camera track');
      cameraShareTrackRef.current.unmute()
        .then(() => console.log('✅ [LiveShareManager] Host camera unmuted successfully'))
        .catch(error => console.error('❌ [LiveShareManager] Failed to unmute host camera:', error));
    }
    
    // Broadcast break ended
    if (sendMessage) {
      sendMessage({
        type: 'liveshare_break_ended',
        data: { ended: true }
      });
    }
    
    // Save to backend
    fetch(`${API_BASE_URL}/api/sessions/${sessionId}/break`, {
      method: 'DELETE',
      credentials: 'include'
    }).catch(err => console.error('Break end error:', err));
    
    toast.success('Welcome back! Stream resumed', {
      icon: '▶️',
      duration: 3000
    });
    
    console.log('▶️ [LiveShareManager] Break ended');
  };
  
  const handleBreakImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    setBreakCustomImage(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setBreakCustomImagePreview(reader.result);
      localStorage.setItem('liveshare_break_custom_image', reader.result);
    };
    reader.readAsDataURL(file);
  };
  
  const handleLowerThirdColorChange = (colorKey, newColor) => {
    setLowerThirdColors(prev => ({ ...prev, [colorKey]: newColor }));
    
    // If lower third is active, re-broadcast with new colors
    if (lowerThirdActive && lowerThirdName.trim() && lowerThirdTitle.trim()) {
      const newColors = colorKey === 'background' 
        ? { background: newColor, accent: lowerThirdColors.accent }
        : { background: lowerThirdColors.background, accent: newColor };
      
      const graphicData = {
        type: 'lower_third',
        content: {
          name: lowerThirdName,
          title: lowerThirdTitle,
          style: {
            bgColor: newColors.background,
            accentBar: newColors.accent
          }
        },
        position: 'bottom-left',
        active: true,
        z_index: 10
      };
      
      fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(graphicData)
      }).catch(err => console.error('Lower third color update error:', err));
      
      if (sendMessage) {
        sendMessage({
          type: 'liveshare_graphics_update',
          data: { graphic: graphicData }
        });
      }
    }
  };

  // Fetch initial graphics state when LiveShare mode is active
  useEffect(() => {
    if (!sessionId || !liveShareMode || liveShareMode === 'regular') return;
    
    const fetchGraphics = async () => {
      try {
        // Fetch graphics state
        const graphicsResponse = await fetch(
          `${API_BASE_URL}/api/sessions/${sessionId}/graphics`,
          { credentials: 'include' }
        );
        
        if (graphicsResponse.ok) {
          const graphics = await graphicsResponse.json();
          
          // Apply graphics state
          graphics.forEach(graphic => {
            if (graphic.type === 'lower_third' && graphic.active) {
              setLowerThirdName(graphic.content.name || '');
              setLowerThirdTitle(graphic.content.title || '');
              setLowerThirdActive(true);
            } else if (graphic.type === 'theme' && graphic.content) {
              setThemeColors(graphic.content);
            }
          });
        }
        
        // Fetch media queue
        const queueResponse = await fetch(
          `${API_BASE_URL}/api/sessions/${sessionId}/media-queue`,
          { credentials: 'include' }
        );
        
        if (queueResponse.ok) {
          const queue = await queueResponse.json();
          setMediaQueue(queue);
        }
      } catch (error) {
        console.error('Failed to fetch graphics:', error);
      }
    };
    
    fetchGraphics();
  }, [sessionId, liveShareMode]);
  
  // Break mode countdown timer
  useEffect(() => {
    if (!isOnBreak || !breakStartTime) return;
    
    const updateCountdown = () => {
      const elapsed = Math.floor((Date.now() - breakStartTime) / 1000); // seconds
      const remaining = Math.max(0, (breakDuration * 60) - elapsed); // convert duration to seconds
      setBreakTimeRemaining(remaining);
      
      // Update break screen layer with new timeRemaining for host
      if (graphicsRendererRef?.current) {
        const breakLayer = graphicsRendererRef.current.layers.find(l => l.id === 'break_screen');
        if (breakLayer) {
          breakLayer.content.timeRemaining = remaining;
          graphicsRendererRef.current.render();
        }
      }
      
      // Auto-end break when time expires
      if (remaining === 0 && isHost) {
        handleEndBreak();
      }
    };
    
    // Update immediately
    updateCountdown();
    
    // Then update every second
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [isOnBreak, breakStartTime, breakDuration, isHost]);
  
  // Save break preferences to localStorage
  useEffect(() => {
    localStorage.setItem('liveshare_break_screen_source', breakScreenSource);
  }, [breakScreenSource]);
  
  useEffect(() => {
    localStorage.setItem('liveshare_break_duration', breakDuration.toString());
  }, [breakDuration]);
  
  useEffect(() => {
    localStorage.setItem('liveshare_break_keep_audio', breakKeepAudio.toString());
  }, [breakKeepAudio]);
  
  useEffect(() => {
    localStorage.setItem('liveshare_break_turn_off_camera', breakTurnOffCamera.toString());
  }, [breakTurnOffCamera]);
  
  // Reset media selection when screen source changes away from media
  useEffect(() => {
    if (breakScreenSource !== 'media') {
      setSelectedBreakMedia([]);
    }
  }, [breakScreenSource]);

  // Get eligible guests (exclude current user)
  const eligibleGuests = watchSessionMembers.filter(
    member => member.id && member.id !== currentUser?.id
  );

  return (
    <>
      <style>{`
        details[open] > summary svg:first-of-type {
          transform: rotate(180deg);
          transition: transform 0.2s ease;
        }
        details > summary svg:first-of-type {
          transition: transform 0.2s ease;
        }
      `}</style>
      <div className="space-y-4">
      {/* Current Mode Status */}
      {liveShareMode && (() => {
        const modeLabels = {
          podcast: 'Podcast Live',
          news: 'News Live',
          show: 'Show Live',
          regular: 'LiveShare Active'
        };
        const modeLabel = modeLabels[liveShareMode] || 'LiveShare Active';
        
        return (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-white">
                  {modeLabel}
                </span>
              </div>
            {isHost && (
              <button
                onClick={() => onLiveShareModeSelect(null)}
                className="bg-red-600/90 hover:bg-red-600 text-white py-1.5 px-3 rounded-lg flex items-center space-x-1.5 text-xs font-semibold transition-colors shadow-lg"
              >
                <span className="text-sm">⏹</span>
                <span>End Live</span>
              </button>
            )}
          </div>
          
            {(liveShareMode === 'podcast' || liveShareMode === 'news' || liveShareMode === 'show') && liveShareGuest && (
              <div className="text-xs text-gray-400">
                Guest: {liveShareGuest.username}
              </div>
            )}
          </div>
        );
      })()}
      
      {/* ✅ Studio Controls - Hide for lecture halls (classroom watchType) and regular mode, show for video/3d_cinema */}
      {showGraphicsControls && liveShareMode && liveShareMode !== 'regular' && isHost && watchType !== 'classroom' && (
        <div className="bg-[#D9D9D9]/10 rounded-xl p-3 space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Studio Controls</h3>
          
          {/* Take a Break Controls */}
          {shouldShowControl('takeABreak') && (
          <details className="bg-gray-800/50 rounded-xl overflow-hidden">
            <summary className="pl-3 pr-2.5 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors list-none">
              <span className="flex items-center gap-2">
                <ChevronDown size={14} className="text-gray-400" />
                <PauseCircle size={16} className="text-cyan-400" />
                Take a Break
              </span>
            </summary>
            <div className="px-2.5 pb-2.5 pt-1.5 space-y-2.5">
              {!isOnBreak ? (
                <>
                  {/* Break Duration */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Break Duration</label>
                    <select
                      value={breakDuration}
                      onChange={(e) => setBreakDuration(parseInt(e.target.value, 10))}
                      className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="1">1 minute</option>
                      <option value="2">2 minutes</option>
                      <option value="3">3 minutes</option>
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                      <option value="20">20 minutes</option>
                      <option value="30">30 minutes</option>
                    </select>
                  </div>
                  
                  {/* Break Screen Source */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">Break Screen</label>
                    <select
                      value={breakScreenSource}
                      onChange={(e) => setBreakScreenSource(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="static">Static Text ("We'll Be Right Back!")</option>
                      <option value="ad">🎬 Show Ad (Earn Revenue)</option>
                      <option value="media">Media Queue</option>
                      <option value="upload">Custom Image</option>
                      <option value="animation">Loading Animation</option>
                    </select>
                    
                    {/* Ad Revenue Info */}
                    {breakScreenSource === 'ad' && (
                      <div className="mt-2 p-2 bg-green-900/20 border border-green-600/30 rounded text-xs text-green-400">
                        💰 Premium placement: $5-10 CPM
                        <br />
                        <span className="text-green-300">Duration: 15-30 seconds (auto)</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Media Queue Selection */}
                  {breakScreenSource === 'media' && (
                    <div className="space-y-3">
                      {/* Play Mode */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-2">Playback Mode</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setBreakMediaMode('one')}
                            className={`flex-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              breakMediaMode === 'one'
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            Play One
                          </button>
                          <button
                            onClick={() => setBreakMediaMode('all')}
                            className={`flex-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              breakMediaMode === 'all'
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            Play All
                          </button>
                        </div>
                      </div>
                      
                      {/* Media Selection */}
                      {mediaQueue.length === 0 ? (
                        <p className="text-xs text-yellow-400 bg-yellow-900/20 rounded p-2">
                          ⚠️ No media in queue. Upload media first.
                        </p>
                      ) : (
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">
                            {breakMediaMode === 'one' ? 'Select Media to Play' : 'Media Queue'}
                          </label>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {mediaQueue.map((item, index) => (
                              <label
                                key={index}
                                className="flex items-center gap-2 p-2 bg-gray-700/50 rounded hover:bg-gray-700 cursor-pointer transition-colors"
                              >
                                {breakMediaMode === 'one' ? (
                                  <input
                                    type="radio"
                                    name="breakMedia"
                                    checked={selectedBreakMedia.length === 1 && selectedBreakMedia[0] === index}
                                    onChange={() => setSelectedBreakMedia([index])}
                                    className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                                  />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={selectedBreakMedia.includes(index)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedBreakMedia([...selectedBreakMedia, index]);
                                      } else {
                                        setSelectedBreakMedia(selectedBreakMedia.filter(i => i !== index));
                                      }
                                    }}
                                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                                  />
                                )}
                                <img
                                  src={item.thumbnail || item.url}
                                  alt={item.filename}
                                  className="w-12 h-12 object-cover rounded"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-white truncate">{item.filename}</p>
                                  <p className="text-xs text-gray-400">{item.type === 'image' ? '📷 Image' : '🎥 Video'}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                          {breakMediaMode === 'all' && (
                            <button
                              onClick={() => setSelectedBreakMedia(mediaQueue.map((_, i) => i))}
                              className="mt-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              Select All
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Custom Image Upload */}
                  {breakScreenSource === 'upload' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Upload Break Image</label>
                      <input
                        ref={breakImageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleBreakImageUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => breakImageInputRef.current?.click()}
                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <Upload size={16} />
                        {breakCustomImagePreview ? 'Change Image' : 'Upload Image'}
                      </button>
                      {breakCustomImagePreview && (
                        <div className="mt-2 relative">
                          <img 
                            src={breakCustomImagePreview} 
                            alt="Break screen preview" 
                            className="w-full h-32 object-cover rounded"
                          />
                          <button
                            onClick={() => {
                              setBreakCustomImage(null);
                              setBreakCustomImagePreview(null);
                              localStorage.removeItem('liveshare_break_custom_image');
                            }}
                            className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 rounded text-white"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Break Options */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={breakKeepAudio}
                        onChange={(e) => setBreakKeepAudio(e.target.checked)}
                        className="w-4 h-4 rounded-md border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
                      />
                      <span>Keep audio on (show mic pulse)</span>
                    </label>
                    
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={breakTurnOffCamera}
                        onChange={(e) => setBreakTurnOffCamera(e.target.checked)}
                        className="w-4 h-4 rounded-md border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
                      />
                      <span>Turn off cameras during break</span>
                    </label>
                  </div>
                  
                  {/* Start Break Button */}
                  <button
                    onClick={handleStartBreak}
                    className="w-full px-4 py-2 sm:px-5 sm:py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <PauseCircle size={18} />
                    Start Break
                  </button>
                </>
              ) : (
                <>
                  {/* Break Active - Show Countdown */}
                  <div className="text-center space-y-3">
                    <div className="text-4xl font-bold text-orange-400">
                      {Math.floor(breakTimeRemaining / 60)}:{String(breakTimeRemaining % 60).padStart(2, '0')}
                    </div>
                    <p className="text-xs text-gray-400">Break in progress...</p>
                    {breakKeepAudio && (
                      <div className="flex items-center justify-center gap-2 text-xs text-green-400">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>Audio active</span>
                      </div>
                    )}
                  </div>
                  
                  {/* End Break Button */}
                  <button
                    onClick={handleEndBreak}
                    className="w-full px-4 py-2 sm:px-5 sm:py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    ▶️ End Break
                  </button>
                </>
              )}
            </div>
          </details>
          )}
          
          {/* All other graphics controls - hidden in Regular mode */}
          {liveShareContentMode !== 'regular' && (
            <>
              {/* Guest Management */}
          <details className="bg-gray-800/50 rounded-lg">
            <summary className="pl-3 pr-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors list-none">
              <span className="flex items-center gap-2">
                <ChevronDown size={14} className="text-gray-400" />
                <Users size={18} className="text-purple-400" />
                Guest Management
              </span>
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-3">
              {/* Current Guest or Select Guest */}
              {selectedGuest ? (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Current Guest</label>
                  <div className="flex items-center justify-between p-2 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {selectedGuest.avatar_url && (
                        <img 
                          src={selectedGuest.avatar_url} 
                          alt={selectedGuest.username}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span className="text-sm text-white font-medium">{selectedGuest.username}</span>
                      <span className="text-xs text-gray-400">(Guest)</span>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedGuest(null);
                        // TODO: Send WebSocket message to revoke guest permission
                        if (sendMessage) {
                          sendMessage({
                            type: 'liveshare_kick_guest',
                            data: { guestId: selectedGuest.id }
                          });
                        }
                      }}
                      className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedGuest(null)}
                    className="mt-2 w-full px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                  >
                    Change Guest
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Select Guest</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const guestId = parseInt(e.target.value);
                      const guest = eligibleGuests.find(g => g.id === guestId);
                      if (guest) {
                        setSelectedGuest(guest);
                        // TODO: Send WebSocket message to grant permission
                        if (sendMessage) {
                          sendMessage({
                            type: 'liveshare_grant_permission',
                            data: { userId: guest.id }
                          });
                        }
                      }
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Choose a guest...</option>
                    {eligibleGuests.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.username || `User ${member.id}`}
                      </option>
                    ))}
                  </select>
                  {eligibleGuests.length === 0 && (
                    <p className="mt-2 text-xs text-gray-500">No other members in session</p>
                  )}
                </div>
              )}
            </div>
          </details>
          
          {/* Graphics Toggles */}
          {shouldShowControl('graphics') && (
          <details className="bg-gray-800/50 rounded-lg relative">
            <summary className="pl-3 pr-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors flex items-center justify-between list-none">
              <span className="flex items-center gap-2">
                <ChevronDown size={14} className="text-gray-400" />
                <UserCircle size={18} className="text-purple-400" />
                User Details
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowLowerThirdColorPicker(!showLowerThirdColorPicker);
                }}
                className="flex items-center gap-1 p-1 hover:bg-gray-700/50 rounded transition-colors"
                title="Customize colors"
              >
                <img src="/icons/colorPaletteIcon.png" alt="Colors" className="w-5 h-5" />
                <div className="flex gap-0.5">
                  <div className="w-3 h-3 rounded-sm border border-gray-600" style={{ backgroundColor: lowerThirdColors.background }}></div>
                  <div className="w-3 h-3 rounded-sm border border-gray-600" style={{ backgroundColor: lowerThirdColors.accent }}></div>
                </div>
              </button>
            </summary>
            
            {/* Color picker popover */}
            {showLowerThirdColorPicker && (
              <div className="absolute right-2 top-12 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg z-20 space-y-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Background</label>
                  <input
                    type="color"
                    value={lowerThirdColors.background}
                    onChange={(e) => handleLowerThirdColorChange('background', e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Accent Bar</label>
                  <input
                    type="color"
                    value={lowerThirdColors.accent}
                    onChange={(e) => handleLowerThirdColorChange('accent', e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
            
            <div className="px-3 pb-3 pt-2 space-y-3">
              {/* Lower Third */}
              <div className="bg-black/30 rounded-lg p-3">
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Name (e.g., John Doe)"
                    value={lowerThirdName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLowerThirdName(value);
                      localStorage.setItem(`liveshare_lower_third_name_${sessionId}`, value);
                    }}
                    className="w-full px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <input
                    type="text"
                    placeholder="Title (e.g., Tech Expert)"
                    value={lowerThirdTitle}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLowerThirdTitle(value);
                      localStorage.setItem(`liveshare_lower_third_title_${sessionId}`, value);
                    }}
                    className="w-full px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleToggleLowerThird}
                      disabled={!lowerThirdName.trim() || !lowerThirdTitle.trim()}
                      className={`flex-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        lowerThirdActive
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed text-white'
                      }`}
                    >
                      {lowerThirdActive ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Logo Bug - Hidden in podcast/news/show/regular modes since they have their own logo displays */}
              {!(liveShareContentMode === 'podcast' || liveShareContentMode === 'news' || liveShareContentMode === 'show' || liveShareContentMode === 'regular') && (
                <div className="bg-black/30 rounded-lg p-3">
                  <label className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={logoBugActive}
                      onChange={() => setLogoBugActive(!logoBugActive)}
                      className="w-4 h-4 rounded accent-purple-500"
                    />
                    <span className="text-sm font-medium text-white">Logo Bug</span>
                  </label>
                  {logoBugActive && (
                    <div className="mt-2">
                      {logoBugPreview ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={logoBugPreview}
                            alt="Logo"
                            className="w-12 h-12 rounded object-cover"
                          />
                          <button
                            onClick={() => {
                              setLogoBugFile(null);
                              setLogoBugPreview(null);
                              setLogoBugActive(false);
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => logoBugInputRef.current?.click()}
                          className="w-full px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                        >
                          Upload Logo (max 500KB)
                        </button>
                      )}
                      <input
                        ref={logoBugInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoBugUpload}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
          )}
          
          {/* Media Queue */}
          {shouldShowControl('mediaQueue') && (
          <details className="bg-gray-800/50 rounded-lg">
            <summary className="pl-3 pr-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors list-none">
              <span className="flex items-center gap-2">
                <ChevronDown size={14} className="text-gray-400" />
                <ImageIcon size={18} className="text-pink-400" />
                Media Queue ({mediaQueue.length}/{MAX_QUEUE_ITEMS})
              </span>
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => mediaQueueInputRef.current?.click()}
                  disabled={mediaQueue.length >= MAX_QUEUE_ITEMS}
                  className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  + Upload Media
                </button>
                <button
                  onClick={() => {
                    const playedItems = mediaQueue.filter(item => item.status === 'played');
                    if (playedItems.length === 0) {
                      toast.info('No played items to clear');
                      return;
                    }
                    
                    // Stop media overlay if any played item is currently displayed
                    handleStopMedia();
                    
                    // Remove played items from queue
                    setMediaQueue(prev => prev.filter(item => item.status !== 'played'));
                    toast.success(`Cleared ${playedItems.length} played item${playedItems.length > 1 ? 's' : ''} and removed from screen`);
                  }}
                  disabled={!mediaQueue.some(item => item.status === 'played')}
                  className="px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  title="Clear played items and remove from screen"
                >
                  🗑️
                </button>
              </div>
              <input
                ref={mediaQueueInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleMediaQueueUpload}
                className="hidden"
              />
              
              {mediaQueue.length > 0 && (
                <div className="space-y-2 mt-2">
                  {mediaQueue.map(item => (
                    <div key={item.id} className="flex items-center gap-2 bg-black/30 p-2 rounded">
                      <img
                        src={item.preview}
                        alt="Media"
                        className="w-10 h-10 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate">{item.file?.name || item.media_url?.split('/').pop() || 'Unknown file'}</p>
                        <p className="text-[10px] text-gray-400">{item.type === 'image' ? '📸 Image' : '🎬 Video'}</p>
                      </div>
                      <button
                        onClick={() => handlePlayMedia(item.id)}
                        disabled={item.status === 'played'}
                        className="px-2 py-1 sm:px-3 sm:py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs sm:text-sm rounded-lg transition-colors"
                      >
                        {item.status === 'played' ? '✓' : '▶'}
                      </button>
                      <button
                        onClick={() => handleDeleteMedia(item.id)}
                        className="px-2 py-1 sm:px-3 sm:py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm rounded-lg transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {mediaQueue.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No media queued</p>
              )}
            </div>
          </details>
          )}
          
          {/* Ticker/Headlines */}
          {shouldShowControl('ticker') && (
          <details className="bg-gray-800/50 rounded-lg relative">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Newspaper size={18} className="text-blue-400" />
                Headlines
              </span>
              {/* Color palette icon with swatch */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowTickerColorPicker(!showTickerColorPicker);
                }}
                className="flex items-center gap-1 p-1 hover:bg-gray-700/50 rounded transition-colors"
                title="Customize color"
              >
                <img src="/icons/colorPaletteIcon.png" alt="Colors" className="w-5 h-5" />
                <div className="w-4 h-4 rounded-sm border border-gray-600" style={{ backgroundColor: tickerColor }}></div>
              </button>
            </summary>
            
            {/* Color picker popover - outside summary */}
            {showTickerColorPicker && (
              <div className="absolute right-3 top-12 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg z-20 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ticker Background</label>
                  <input
                    type="color"
                    value={tickerColor}
                    onChange={(e) => handleTickerColorChange(e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Time Box Background</label>
                  <input
                    type="color"
                    value={timeBoxColor}
                    onChange={(e) => handleTimeBoxColorChange(e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
            
            <div className="px-3 pb-3 pt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400">Scrolling news ticker</span>
                <button
                  onClick={handleToggleTicker}
                  className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    tickerActive
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tickerActive ? 'Hide' : 'Show'}
                </button>
              </div>
              
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={tickerText}
                  onChange={(e) => {
                    const newText = e.target.value;
                    setTickerText(newText);
                    localStorage.setItem(`liveshare_ticker_text_${sessionId}`, newText);
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTickerItem()}
                  placeholder="Enter headline..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleAddTickerItem}
                  className="px-4 py-2 sm:px-5 sm:py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Add
                </button>
              </div>
              
              {tickerItems.length > 0 && (
                <div className="space-y-2">
                  {tickerItems.map((item, index) => (
                    <div key={index} className="flex items-center justify-between bg-black/30 rounded px-3 py-2">
                      <span className="text-sm text-gray-300 truncate flex-1">{item}</span>
                      <button
                        onClick={() => {
                          const newItems = tickerItems.filter((_, i) => i !== index);
                          setTickerItems(newItems);
                          localStorage.setItem(`liveshare_ticker_items_${sessionId}`, JSON.stringify(newItems));
                        }}
                        className="text-red-400 hover:text-red-300 text-xs ml-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {tickerItems.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No headlines added</p>
              )}
            </div>
          </details>
          )}
          
          {/* Breaking News Banner */}
          {shouldShowControl('banner') && (
          <details className="bg-gray-800/50 rounded-lg relative">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle size={18} className="text-red-400" />
                Breaking News Banner
              </span>
              {/* Color palette icon with swatches */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowBannerColorPicker(!showBannerColorPicker);
                }}
                className="flex items-center gap-1 p-1 hover:bg-gray-700/50 rounded transition-colors"
                title="Customize colors"
              >
                <img src="/icons/colorPaletteIcon.png" alt="Colors" className="w-5 h-5" />
                <div className="flex gap-0.5">
                  <div className="w-3 h-3 rounded-sm border border-gray-600" style={{ backgroundColor: bannerColor }}></div>
                  <div className="w-3 h-3 rounded-sm border border-gray-600" style={{ backgroundColor: bannerTextColor }}></div>
                </div>
              </button>
            </summary>
            
            {/* Color picker popover - outside summary */}
            {showBannerColorPicker && (
              <div className="absolute right-3 top-12 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg z-20 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Background</label>
                  <input
                    type="color"
                    value={bannerColor}
                    onChange={(e) => handleBannerColorChange(e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Text Color</label>
                  <input
                    type="color"
                    value={bannerTextColor}
                    onChange={(e) => handleBannerTextColorChange(e.target.value)}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
            
            <div className="px-3 pb-3 pt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400">Breaking news banner</span>
                <button
                  onClick={handleToggleBanner}
                  disabled={!bannerText.trim()}
                  className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    bannerActive
                      ? 'bg-gray-600 text-white hover:bg-gray-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  } disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed`}
                >
                  {bannerActive ? 'Hide' : 'Show'}
                </button>
              </div>
              
              {/* Layout Selector */}
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-2">Banner Style</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setBannerLayout('bn');
                      localStorage.setItem('liveshare_banner_layout', 'bn');
                      // Re-broadcast if active
                      if (bannerActive) {
                        setTimeout(() => handleToggleBanner(), 50);
                        setTimeout(() => handleToggleBanner(), 100);
                      }
                    }}
                    className={`flex-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-sm transition-colors ${
                      bannerLayout === 'bn'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    BN Style (Right)
                  </button>
                  <button
                    onClick={() => {
                      setBannerLayout('breakin');
                      localStorage.setItem('liveshare_banner_layout', 'breakin');
                      // Re-broadcast if active
                      if (bannerActive) {
                        setTimeout(() => handleToggleBanner(), 50);
                        setTimeout(() => handleToggleBanner(), 100);
                      }
                    }}
                    className={`flex-1 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-sm transition-colors ${
                      bannerLayout === 'breakin'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Breakin Style (Top)
                  </button>
                </div>
              </div>
              
              <input
                type="text"
                value={bannerText}
                onChange={(e) => {
                  const newText = e.target.value;
                  setBannerText(newText);
                  localStorage.setItem(`liveshare_banner_text_${sessionId}`, newText);
                }}
                placeholder="BREAKING: Enter breaking news..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
              />
              
              <p className="text-xs text-gray-500 mt-2">
                Banner will appear at the top of the screen
              </p>
            </div>
          </details>
          )}
          
          {/* Bible Verse Control (Church mode only) */}
          {liveShareContentMode === 'church' && (
            <BibleControl 
              onShowVerse={handleShowBibleVerse}
              onHideVerse={handleHideBibleVerse}
              currentVerse={currentBibleVerse}
            />
          )}
            </>
          )}
        </div>
      )}

      {/* 👥 Guest Management - Standalone for Lecture Halls (classroom watchType) */}
      {watchType === 'classroom' && liveShareMode && isHost && (
        <div className="bg-[#D9D9D9]/10 rounded-xl p-4">
          <details open className="bg-gray-800/50 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors">
              <span className="flex items-center gap-2">
                <Users size={18} className="text-purple-400" />
                Guest Management
              </span>
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-3">
              {/* Current Guest or Select Guest */}
              {selectedGuest ? (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Current Guest</label>
                  <div className="flex items-center justify-between p-2 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {selectedGuest.avatar_url && (
                        <img 
                          src={selectedGuest.avatar_url} 
                          alt={selectedGuest.username}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span className="text-sm text-white font-medium">{selectedGuest.username}</span>
                      <span className="text-xs text-gray-400">(Guest)</span>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedGuest(null);
                        if (sendMessage) {
                          sendMessage({
                            type: 'liveshare_kick_guest',
                            data: { guestId: selectedGuest.id }
                          });
                        }
                      }}
                      className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedGuest(null)}
                    className="mt-2 w-full px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                  >
                    Change Guest
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Select Guest</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const guestId = parseInt(e.target.value);
                      const guest = eligibleGuests.find(g => g.id === guestId);
                      if (guest) {
                        console.log('🎙️ [GRANT PERMISSION] Host selecting guest:', {
                          guestId: guest.id,
                          guestUsername: guest.username,
                          sessionId: sessionId
                        });
                        setSelectedGuest(guest);
                        if (sendMessage) {
                          console.log('📤 [GRANT PERMISSION] Sending WebSocket message:', {
                            type: 'liveshare_grant_permission',
                            data: { userId: guest.id }
                          });
                          sendMessage({
                            type: 'liveshare_grant_permission',
                            data: { userId: guest.id }
                          });
                        } else {
                          console.error('❌ [GRANT PERMISSION] sendMessage function not available!');
                        }
                      }
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Choose a guest...</option>
                    {eligibleGuests.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.username || `User ${member.id}`}
                      </option>
                    ))}
                  </select>
                  {eligibleGuests.length === 0 && (
                    <p className="mt-2 text-xs text-gray-500">No other members in session</p>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      {/* Host Controls */}
      {isHost && (
        <div className="space-y-3">
          {!liveShareMode || liveShareMode === 'regular' ? (
            <div className="bg-black p-3 sm:p-4 rounded-lg">
              <button
                onClick={() => {
                  // Open unified LiveShare wizard
                  setShowLiveShareWizard(true);
                }}
                className="w-full bg-[#444AF7]/20 hover:bg-[#444AF7]/30 text-white py-2 px-4 rounded-full flex items-center justify-center space-x-2 font-medium text-sm sm:text-[15px] transition-colors"
              >
                <img src="/icons/LiveIcon.svg" alt="Live" className="w-5 h-5" />
                <span>Go Live</span>
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Guest Permission Status - Simplified Invitation */}
      {!isHost && hasLiveSharePermission && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="text-sm text-green-400 mb-2">
            ✓ You've been invited as co-host!
          </div>
          <button
            onClick={() => {
              console.log('🎙️ [GUEST JOIN] Button clicked - opening invitation popup');
              // Show invitation popup instead of wizard
              const invitationData = {
                hostUsername: watchSessionMembers.find(m => m.is_host)?.username || 'Host',
                showTitle: podcastConfig?.title || null,
                mode: liveShareContentMode || 'podcast'
              };
              console.log('📋 [GUEST JOIN] Invitation data:', invitationData);
              setGuestInvitationData(invitationData);
              setIsGuest(true);
              setShowGuestInvitation(true);
            }}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition-colors animate-pulse"
          >
            Join as Co-Host 🎙️
          </button>
        </div>
      )}

      {/* Guest Switch Share Type Button (shown when guest is live) */}
      {isGuest && liveShareContentMode && guestShareType && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="text-sm text-blue-400 mb-2">
            Currently sharing: {guestShareType === 'camera' ? '📹 Camera' : '🖥️ Screen'}
          </div>
          <button
            onClick={() => setShowGuestSwitchType(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
          >
            Switch Share Type
          </button>
        </div>
      )}

      {/* Mode Selector Modal */}
      {showModeSelector && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Select LiveShare Mode</h2>
              <button
                onClick={() => setShowModeSelector(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-3">
              {modes.map(mode => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleModeSelect(mode)}
                    className={`w-full p-4 rounded-lg border-2 border-${mode.color}-500/30 bg-${mode.color}-500/10 hover:bg-${mode.color}-500/20 transition-all flex items-center space-x-4`}
                  >
                    <Icon className={`text-${mode.color}-400`} size={28} />
                    <h3 className="font-semibold text-white text-lg">{mode.name}</h3>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Type Selector Modal */}
      {showTypeSelector && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Select Share Type</h2>
              <button
                onClick={() => setShowTypeSelector(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Screen Share Only */}
              <button
                onClick={() => handleTypeSelect('screen')}
                className="w-full p-4 rounded-lg bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-white text-left"
              >
                <div className="flex items-center space-x-3 mb-1">
                  <Monitor size={20} className="text-purple-400" />
                  <div className="font-semibold">Screen Share</div>
                </div>
                <div className="text-sm text-gray-400">Share your screen only</div>
              </button>
              
              {/* Camera Only */}
              <button
                onClick={() => handleTypeSelect('camera')}
                className="w-full p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 text-white text-left"
              >
                <div className="flex items-center space-x-3 mb-1">
                  <Camera size={20} className="text-blue-400" />
                  <div className="font-semibold">Camera</div>
                </div>
                <div className="text-sm text-gray-400">Share your camera only</div>
              </button>
              
              {/* Screen + Camera (disabled for guests) */}
              {!(!isHost && hasLiveSharePermission) && (
              <button
                onClick={() => handleTypeSelect('both')}
                className="w-full p-4 rounded-lg bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 text-white text-left"
              >
                <div className="flex items-center space-x-3 mb-1">
                  <Users size={20} className="text-pink-400" />
                  <div className="font-semibold">Screen + Camera</div>
                </div>
                <div className="text-sm text-gray-400">Share screen with camera overlay</div>
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Setup Modal (Podcast/News/Show) */}
      {showPodcastSetup && (() => {
        const modeConfig = {
          podcast: { icon: <Mic size={20} className="text-purple-400" />, title: 'Podcast Setup', fieldLabel: 'Episode Title', guestLabel: 'Guest', buttonText: 'Start Podcast' },
          news: { icon: <Radio size={20} className="text-red-400" />, title: 'News Setup', fieldLabel: 'Broadcast Title', guestLabel: 'Co-Anchor', buttonText: 'Start News' },
          show: { icon: <Clapperboard size={20} className="text-blue-400" />, title: 'Show Setup', fieldLabel: 'Show Title', guestLabel: 'Co-Host', buttonText: 'Start Show' }
        };
        const config = modeConfig[selectedMode] || modeConfig.podcast;
        
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-gray-900 rounded-lg max-w-md w-full p-4 sm:p-6 my-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {config.icon}
                  {config.title}
                </h2>
                <button
                  onClick={() => setShowPodcastSetup(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {config.fieldLabel} *
                  </label>
                <input
                  type="text"
                  value={podcastTitle}
                  onChange={(e) => setPodcastTitle(e.target.value)}
                  placeholder="e.g., Tech Talks: AI in Africa"
                  autoFocus
                  className="w-full px-3 py-2 text-sm sm:text-base bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

                {/* Logo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Logo (Optional, max 2MB)
                  </label>
                <div className="flex items-center space-x-3">
                  {podcastLogoPreview ? (
                    <div className="relative">
                      <img
                        src={podcastLogoPreview}
                        alt="Logo preview"
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <button
                        onClick={() => {
                          setPodcastLogo(null);
                          setPodcastLogoPreview(null);
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="w-16 h-16 bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center hover:border-purple-500 transition-colors"
                    >
                      <ImageIcon size={24} className="text-gray-500" />
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <div className="text-xs text-gray-500">
                    JPG, PNG, WebP, or GIF
                  </div>
                </div>
              </div>

                {/* Guest Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select {config.guestLabel} (Optional)
                  </label>
                <select
                  value={selectedGuest?.id || ''}
                  onChange={(e) => {
                    const userId = e.target.value ? parseInt(e.target.value) : null;
                    const guest = eligibleGuests.find(m => m.id === userId);
                    setSelectedGuest(guest || null);
                  }}
                  className="w-full px-3 py-2 text-sm sm:text-base bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">No guest (Solo)</option>
                  {eligibleGuests.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.username || `User ${member.id}`}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Title Styling Section (Collapsible) */}
              <details className="bg-gray-800/50 rounded-lg overflow-hidden" open={showTitleStyling}>
                <summary 
                  className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-300 hover:text-white flex items-center justify-between"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowTitleStyling(!showTitleStyling);
                  }}
                >
                  <span>Title Styling (Optional)</span>
                  <ChevronDown size={16} className={`transform transition-transform ${showTitleStyling ? 'rotate-180' : ''}`} />
                </summary>
                
                {showTitleStyling && (
                  <div className="px-3 pb-3 space-y-3">
                    {/* Color Picker */}
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">Color</label>
                      <div className="flex items-center gap-2 mb-2">
                        {colorPresets.map(preset => (
                          <button
                            key={preset.value}
                            onClick={() => setTitleColor(preset.value)}
                            className={`w-8 h-8 rounded border-2 transition-all ${
                              titleColor === preset.value ? 'border-white scale-110' : 'border-gray-600'
                            }`}
                            style={{ backgroundColor: preset.value }}
                            title={preset.name}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={titleColor}
                          onChange={(e) => setTitleColor(e.target.value)}
                          className="w-12 h-8 rounded cursor-pointer bg-gray-700 border border-gray-600"
                        />
                        <input
                          type="text"
                          value={titleColor}
                          onChange={(e) => setTitleColor(e.target.value)}
                          className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                          placeholder="#FFFFFF"
                        />
                      </div>
                    </div>
                    
                    {/* Font Size Slider */}
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Size: {titleSize}px
                      </label>
                      <input
                        type="range"
                        min="16"
                        max="48"
                        step="2"
                        value={titleSize}
                        onChange={(e) => setTitleSize(parseInt(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>16px</span>
                        <span>48px</span>
                      </div>
                    </div>
                    
                    {/* Font Weight Dropdown */}
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">Weight</label>
                      <select
                        value={titleWeight}
                        onChange={(e) => setTitleWeight(parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="300">Light (300)</option>
                        <option value="400">Normal (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="700">Bold (700)</option>
                        <option value="800">Extra Bold (800)</option>
                      </select>
                    </div>
                    
                    {/* Text Case Dropdown */}
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">Text Case</label>
                      <select
                        value={titleCase}
                        onChange={(e) => setTitleCase(e.target.value)}
                        className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="none">As Typed</option>
                        <option value="title">Title Case</option>
                        <option value="upper">UPPERCASE</option>
                        <option value="lower">lowercase</option>
                        <option value="sentence">Sentence case</option>
                      </select>
                    </div>
                    
                    {/* Logo Size Slider */}
                    {podcastLogoPreview && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">
                          Logo Size: {logoSize}px
                        </label>
                        <input
                          type="range"
                          min="50"
                          max="300"
                          step="10"
                          value={logoSize}
                          onChange={(e) => setLogoSize(parseInt(e.target.value))}
                          className="w-full accent-purple-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>50px</span>
                          <span>300px</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Logo X Position Slider */}
                    {podcastLogoPreview && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">
                          Logo X Position: {logoX}px from left
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="200"
                          step="5"
                          value={logoX}
                          onChange={(e) => setLogoX(parseInt(e.target.value))}
                          className="w-full accent-purple-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>0px</span>
                          <span>200px</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Logo Y Position Slider */}
                    {podcastLogoPreview && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">
                          Logo Y Position: {logoY}px from bottom
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="500"
                          step="10"
                          value={logoY}
                          onChange={(e) => setLogoY(parseInt(e.target.value))}
                          className="w-full accent-purple-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>0px</span>
                          <span>500px</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Preset Buttons */}
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">Presets</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => applyPreset('professional')}
                          className="px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs sm:text-sm text-white transition-colors"
                        >
                          Professional
                        </button>
                        <button
                          onClick={() => applyPreset('vibrant')}
                          className="px-3 py-2 sm:px-4 sm:py-2.5 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/50 rounded-lg text-xs sm:text-sm text-yellow-300 transition-colors"
                        >
                          Vibrant
                        </button>
                        <button
                          onClick={() => applyPreset('minimal')}
                          className="px-3 py-2 sm:px-4 sm:py-2.5 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg text-xs sm:text-sm text-gray-400 transition-colors"
                        >
                          Minimal
                        </button>
                      </div>
                    </div>
                    
                    {/* Preview Toggle (Desktop/Tablet only) */}
                    <div className="hidden md:block">
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="w-full px-3 py-2 sm:px-4 sm:py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 rounded-lg text-sm text-purple-300 transition-colors"
                      >
                        {showPreview ? 'Hide Preview' : 'Show Preview'}
                      </button>
                    </div>
                    
                    {/* Preview Mock Screen */}
                    {showPreview && (
                      <div className="hidden md:block bg-black rounded-lg p-4 relative" style={{ height: '120px' }}>
                        {/* Logo Preview */}
                        {podcastLogoPreview && (
                          <img
                            src={podcastLogoPreview}
                            alt="Logo"
                            className="absolute rounded-lg object-cover"
                            style={{
                              width: `${logoSize * 0.5}px`,
                              height: `${logoSize * 0.5}px`,
                              left: `${logoX * 0.5}px`,
                              bottom: `${logoY * 0.5}px`
                            }}
                          />
                        )}
                        {/* Title Preview */}
                        <div className="absolute bottom-3 left-3">
                          <div 
                            className="px-4 py-2 bg-black/70 backdrop-blur-sm rounded-lg inline-block"
                            style={{
                              color: titleColor,
                              fontSize: `${titleSize * 0.5}px`,
                              fontWeight: titleWeight
                            }}
                          >
                            {applyTextCase(podcastTitle || 'Your title here', titleCase)}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Reset Button */}
                    <button
                      onClick={resetTitleStyle}
                      className="w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-colors"
                    >
                      Reset to Default
                    </button>
                  </div>
                )}
              </details>

                {/* Start Button */}
                <button
                  onClick={handleStartPodcast}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 sm:py-3 px-4 rounded-lg font-semibold text-sm sm:text-base"
                >
                  {config.buttonText}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Layout Selector Modal */}
      {showLayoutSelector && (
        <LiveShareLayoutSelector
          hasGuest={!!selectedGuest}
          hasScreenShare={selectedShareType === 'screen' || selectedShareType === 'both'}
          onSelectLayout={handleLayoutSelect}
          onClose={() => setShowLayoutSelector(false)}
        />
      )}

      {/* Unified LiveShare Wizard */}
      {showLiveShareWizard && (
        <LiveShareWizard
          onComplete={handleWizardComplete}
          onClose={() => setShowLiveShareWizard(false)}
          isGuest={!isHost && hasLiveSharePermission}
          watchType={watchType}
          watchSessionMembers={watchSessionMembers}
          currentUser={currentUser}
          availableCameras={availableCameras} // 📹 Pass available cameras
          selectedCameraId={selectedCameraId} // 📹 Pass current camera
        />
      )}

      {/* ✅ Simplified Guest Invitation Popup */}
      {showGuestInvitation && guestInvitationData && (
        <GuestInvitationPopup
          invitation={guestInvitationData}
          onAccept={async (shareType) => {
            console.log(`🎙️ [Guest] Accepting invitation with share type: ${shareType}`);
            
            // Auto-select layout based on stream count
            const hostShareType = liveShareMode || 'camera'; // Get host's current share type
            const autoLayout = calculateAutoLayout(hostShareType, shareType);
            
            console.log(`🎨 [Guest] Auto-selected layout: ${autoLayout}`);
            
            // Save guest share type for mid-stream switching
            setGuestShareType(shareType);
            
            // Start LiveShare directly with guest config
            const guestConfig = {
              mode: 'regular', // Guest doesn't set content mode, only share type
              layout: autoLayout,
              type: shareType,
              deviceId: null, // Use default device
            };
            
            // Close invitation
            setShowGuestInvitation(false);
            setGuestInvitationData(null);
            
            // Notify host about guest joining and suggested layout
            if (sendMessage) {
              sendMessage({
                type: 'liveshare_guest_joined',
                data: {
                  guestShareType: shareType,
                  suggestedLayout: autoLayout
                }
              });
            }
            
            // Start sharing via type selector handler
            if (onLiveShareTypeSelect) {
              // Pass shareType, deviceId (null for screen share), and autoLayout
              onLiveShareTypeSelect(shareType, null, autoLayout);
            }
          }}
          onDecline={() => {
            console.log('🎙️ [Guest] Declined invitation');
            setShowGuestInvitation(false);
            setGuestInvitationData(null);
            setIsGuest(false);
            toast.info('Invitation declined');
          }}
        />
      )}

      {/* ✅ Guest Switch Share Type Modal */}
      {showGuestSwitchType && guestShareType && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Switch Share Type</h2>
              <button
                onClick={() => setShowGuestSwitchType(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Choose a new share type. Your current stream will stop and restart with the new type.
              </p>

              <div className="space-y-3">
                {/* Camera Option */}
                <button
                  onClick={async () => {
                    const newType = 'camera';
                    console.log(`🔄 [Guest] Switching from ${guestShareType} to ${newType}`);
                    
                    // Calculate new layout
                    const hostShareType = liveShareMode || 'camera';
                    const newLayout = calculateAutoLayout(hostShareType, newType);
                    
                    // Update state
                    setGuestShareType(newType);
                    setShowGuestSwitchType(false);
                    
                    // Notify host
                    if (sendMessage) {
                      sendMessage({
                        type: 'liveshare_guest_switched_type',
                        data: {
                          newShareType: newType,
                          suggestedLayout: newLayout
                        }
                      });
                    }
                    
                    // Restart with new type
                    const guestConfig = {
                      mode: 'regular',
                      layout: newLayout,
                      type: newType,
                      deviceId: null,
                    };
                    
                    if (onLiveShareTypeSelect) {
                      onLiveShareTypeSelect(newType, guestConfig);
                    }
                    
                    toast.success('Switched to camera');
                  }}
                  disabled={guestShareType === 'camera'}
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    guestShareType === 'camera'
                      ? 'bg-blue-500/20 border-blue-500/50 cursor-not-allowed'
                      : 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-1">
                    <Camera size={20} className="text-blue-400" />
                    <div className="font-semibold text-white">Camera</div>
                    {guestShareType === 'camera' && (
                      <span className="ml-auto text-xs text-blue-400">Current</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">Share your camera feed</div>
                </button>

                {/* Screen Option */}
                <button
                  onClick={async () => {
                    const newType = 'screen';
                    console.log(`🔄 [Guest] Switching from ${guestShareType} to ${newType}`);
                    
                    // Calculate new layout
                    const hostShareType = liveShareMode || 'camera';
                    const newLayout = calculateAutoLayout(hostShareType, newType);
                    
                    // Update state
                    setGuestShareType(newType);
                    setShowGuestSwitchType(false);
                    
                    // Notify host
                    if (sendMessage) {
                      sendMessage({
                        type: 'liveshare_guest_switched_type',
                        data: {
                          newShareType: newType,
                          suggestedLayout: newLayout
                        }
                      });
                    }
                    
                    // Restart with new type
                    const guestConfig = {
                      mode: 'regular',
                      layout: newLayout,
                      type: newType,
                      deviceId: null,
                    };
                    
                    if (onLiveShareTypeSelect) {
                      onLiveShareTypeSelect(newType, guestConfig);
                    }
                    
                    toast.success('Switched to screen share');
                  }}
                  disabled={guestShareType === 'screen'}
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    guestShareType === 'screen'
                      ? 'bg-purple-500/20 border-purple-500/50 cursor-not-allowed'
                      : 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-1">
                    <Monitor size={20} className="text-purple-400" />
                    <div className="font-semibold text-white">Screen</div>
                    {guestShareType === 'screen' && (
                      <span className="ml-auto text-xs text-purple-400">Current</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">Share your screen</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
