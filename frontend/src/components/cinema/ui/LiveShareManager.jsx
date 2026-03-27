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
  Clapperboard
} from 'lucide-react';
import LiveShareLayoutSelector from './LiveShareLayoutSelector';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export default function LiveShareManager({
  // Session data
  sessionId,
  watchSessionMembers = [],
  currentUser,
  isHost,
  watchType, // 'video', '3d_cinema', or 'classroom'
  
  // Current state
  liveShareMode,
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
}) {
  // Modal state
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
  const [lowerThirdName, setLowerThirdName] = useState('');
  const [lowerThirdTitle, setLowerThirdTitle] = useState('');
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
  const [tickerText, setTickerText] = useState('');
  const [tickerActive, setTickerActive] = useState(false);
  const [tickerItems, setTickerItems] = useState([]);
  
  // Banner state (Phase 2)
  const [bannerText, setBannerText] = useState('');
  const [bannerActive, setBannerActive] = useState(false);
  
  // Theme colors state (Phase 1)
  const [themeColors, setThemeColors] = useState({
    primary: '#DC2626',
    secondary: '#991B1B',
    accent: '#0052A5'
  });
  
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
    
    if (mediaQueue.length + files.length > MAX_QUEUE_ITEMS) {
      toast.error(`Maximum ${MAX_QUEUE_ITEMS} items allowed in queue`);
      return;
    }
    
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
      
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
          setMediaQueue(prev => [...prev, {
            ...queueItem,
            file,
            preview: URL.createObjectURL(file)
          }]);
          toast.success(`${file.name} added to queue`);
        } else {
          toast.error(`Failed to upload ${file.name}`);
        }
      } catch (error) {
        console.error('Media upload error:', error);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  };
  
  const handlePlayMedia = (itemId) => {
    const mediaItem = mediaQueue.find(item => item.id === itemId);
    if (!mediaItem) return;
    
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
    
    // Broadcast to all viewers via WebSocket
    if (sendMessage) {
      sendMessage({
        type: 'liveshare_graphics_update',
        data: { graphic: graphicData }
      });
    }
    
    // Update local state
    setMediaQueue(prev => prev.map(item => 
      item.id === itemId ? { ...item, status: 'played' } : item
    ));
    
    console.log('🎨 [LiveShareManager] Media queue play broadcast:', graphicData);
  };
  
  const handleAddTickerItem = () => {
    if (!tickerText.trim()) {
      toast.error('Please enter ticker text');
      return;
    }
    
    const newItems = [...tickerItems, tickerText];
    setTickerItems(newItems);
    setTickerText('');
    
    // Graphics data for ticker
    const graphicData = {
      type: 'ticker',
      content: { items: newItems },
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
      content: { items: tickerItems },
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
    
    const graphicData = {
      type: 'banner',
      content: { text: bannerText },
      position: 'top',
      active: newActive,
      z_index: 11
    };
    
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
  
  const handleDeleteMedia = async (itemId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/media-queue/${itemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        setMediaQueue(prev => prev.filter(item => item.id !== itemId));
        toast.success('Media removed from queue');
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
        title: lowerThirdTitle
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
  
  const handleThemeColorChange = async (colorKey, value) => {
    setThemeColors(prev => ({ ...prev, [colorKey]: value }));
    
    // Debounced API call (only send after user stops changing)
    if (window.themeColorTimeout) clearTimeout(window.themeColorTimeout);
    window.themeColorTimeout = setTimeout(async () => {
      try {
        await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/graphics`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'theme',
            content: { ...themeColors, [colorKey]: value },
            position: '',
            active: true,
            z_index: 1
          })
        });
      } catch (error) {
        console.error('Theme update error:', error);
      }
    }, 500);
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

  // Get eligible guests (exclude current user)
  const eligibleGuests = watchSessionMembers.filter(
    member => member.id && member.id !== currentUser?.id
  );

  return (
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
                className="text-xs text-red-400 hover:text-red-300"
              >
                End Session
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
      
      {/* ✅ Studio Controls - Always show when ANY LiveShare mode is active */}
      {showGraphicsControls && liveShareMode && isHost && (
        <div className="bg-[#D9D9D9]/10 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase">Studio Controls</h3>
          
          {/* Guest Management */}
          <details open className="bg-gray-800/50 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors">
              👥 Guest Management
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
          
          {/* Theme Colors */}
          <details className="bg-gray-800/50 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors">
              🎨 Theme Colors
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Primary Color</label>
                <input
                  type="color"
                  value={themeColors.primary}
                  onChange={(e) => handleThemeColorChange('primary', e.target.value)}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Secondary Color</label>
                <input
                  type="color"
                  value={themeColors.secondary}
                  onChange={(e) => handleThemeColorChange('secondary', e.target.value)}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Accent Color</label>
                <input
                  type="color"
                  value={themeColors.accent}
                  onChange={(e) => handleThemeColorChange('accent', e.target.value)}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div>
            </div>
          </details>
          
          {/* Graphics Toggles */}
          <details className="bg-gray-800/50 rounded-lg" open>
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors">
              📺 Graphics
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-3">
              {/* Lower Third */}
              <div className="bg-black/30 rounded-lg p-3">
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Name (e.g., John Doe)"
                    value={lowerThirdName}
                    onChange={(e) => setLowerThirdName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <input
                    type="text"
                    placeholder="Title (e.g., Tech Expert)"
                    value={lowerThirdTitle}
                    onChange={(e) => setLowerThirdTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleToggleLowerThird}
                      disabled={!lowerThirdName.trim() || !lowerThirdTitle.trim()}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
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
              
              {/* Logo Bug */}
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
                        className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-gray-300 transition-colors"
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
            </div>
          </details>
          
          {/* Media Queue */}
          <details className="bg-gray-800/50 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors">
              📸 Media Queue ({mediaQueue.length}/{MAX_QUEUE_ITEMS})
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-2">
              <button
                onClick={() => mediaQueueInputRef.current?.click()}
                disabled={mediaQueue.length >= MAX_QUEUE_ITEMS}
                className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
              >
                + Upload Media
              </button>
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
                        <p className="text-xs text-white truncate">{item.file.name}</p>
                        <p className="text-[10px] text-gray-400">{item.type === 'image' ? '📸 Image' : '🎬 Video'}</p>
                      </div>
                      <button
                        onClick={() => handlePlayMedia(item.id)}
                        disabled={item.status === 'played'}
                        className="px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs rounded transition-colors"
                      >
                        {item.status === 'played' ? '✓' : '▶'}
                      </button>
                      <button
                        onClick={() => handleDeleteMedia(item.id)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
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
          
          {/* Ticker/Headlines */}
          <details className="bg-gray-800/50 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors">
              📰 Ticker / Headlines
            </summary>
            <div className="px-3 pb-3 pt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400">Scrolling news ticker</span>
                <button
                  onClick={handleToggleTicker}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
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
                  onChange={(e) => setTickerText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTickerItem()}
                  placeholder="Enter headline..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleAddTickerItem}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors"
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
          
          {/* Breaking News Banner */}
          <details className="bg-gray-800/50 rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-white hover:text-purple-400 transition-colors">
              🚨 Breaking News Banner
            </summary>
            <div className="px-3 pb-3 pt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400">Top screen banner</span>
                <button
                  onClick={handleToggleBanner}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    bannerActive
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {bannerActive ? 'Hide' : 'Show'}
                </button>
              </div>
              
              <input
                type="text"
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                placeholder="BREAKING: Enter breaking news..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
              />
              
              <p className="text-xs text-gray-500 mt-2">
                Banner will appear at the top of the screen
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Host Controls */}
      {isHost && (
        <div className="space-y-3">
          {liveShareMode && liveShareMode !== 'regular' ? (
            <button
              onClick={() => onLiveShareModeSelect(null)}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg flex items-center justify-center space-x-2 font-semibold"
            >
              <X size={20} />
              <span>End Live</span>
            </button>
          ) : (
            <div className="bg-black p-3 sm:p-4 rounded-lg">
              <button
                onClick={() => {
                  // For Lecture Hall, skip mode selection and go directly to type selection
                  if (watchType === 'classroom') {
                    setSelectedMode('regular');
                    setShowTypeSelector(true);
                  } else {
                    setShowModeSelector(true);
                  }
                }}
                className="w-full bg-[#444AF7]/20 hover:bg-[#444AF7]/30 text-white py-2 px-4 rounded-full flex items-center justify-center space-x-2 font-medium text-sm sm:text-[15px] transition-colors"
              >
                <img src="/icons/LiveIcon.svg" alt="Live" className="w-5 h-5" />
                <span>Go Live</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Guest Permission Status */}
      {!isHost && hasLiveSharePermission && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="text-sm text-green-400 mb-2">
            ✓ You have permission to join
          </div>
          <button
            onClick={onStartScreenShare}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg"
          >
            Join LiveShare
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
              
              {/* Screen + Camera */}
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
            </div>
          </div>
        </div>
      )}

      {/* Setup Modal (Podcast/News/Show) */}
      {showPodcastSetup && (() => {
        const modeConfig = {
          podcast: { emoji: '🎙️', title: 'Podcast Setup', fieldLabel: 'Episode Title', guestLabel: 'Guest', buttonText: 'Start Podcast' },
          news: { emoji: '📰', title: 'News Setup', fieldLabel: 'Broadcast Title', guestLabel: 'Co-Anchor', buttonText: 'Start News' },
          show: { emoji: '🎬', title: 'Show Setup', fieldLabel: 'Show Title', guestLabel: 'Co-Host', buttonText: 'Start Show' }
        };
        const config = modeConfig[selectedMode] || modeConfig.podcast;
        
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-gray-900 rounded-lg max-w-md w-full p-4 sm:p-6 my-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">{config.emoji} {config.title}</h2>
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
                          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition-colors"
                        >
                          Professional
                        </button>
                        <button
                          onClick={() => applyPreset('vibrant')}
                          className="px-3 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/50 rounded text-xs text-yellow-300 transition-colors"
                        >
                          Vibrant
                        </button>
                        <button
                          onClick={() => applyPreset('minimal')}
                          className="px-3 py-2 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded text-xs text-gray-400 transition-colors"
                        >
                          Minimal
                        </button>
                      </div>
                    </div>
                    
                    {/* Preview Toggle (Desktop/Tablet only) */}
                    <div className="hidden md:block">
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 rounded text-sm text-purple-300 transition-colors"
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
    </div>
  );
}
