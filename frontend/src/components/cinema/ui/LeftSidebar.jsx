// src/components/cinema/ui/LeftSidebar.jsx
import { useState, useRef, useEffect } from 'react';
import { uploadMediaToRoom } from '../../../services/api';

export default function LeftSidebar({
  roomId,
  currentMedia,
  mousePosition,
  isLeftSidebarOpen,
  isScreenSharingActive, // ✅ from parent (LiveKit state)
  onEndScreenShare,      // ✅ from parent (calls localParticipant.setScreenShareEnabled(false))
  isConnected,
  playlist,
  currentUser,
  sendMessage,
  onDeleteMedia,
  onStartScreenShare,    // ✅ from parent (calls localParticipant.setScreenShareEnabled(true))
  onMediaSelect,
  onCameraPreview,
  isHost,
  onClose,
  onUploadComplete,      // ✅ NEW: callback to refresh playlist after upload
  sessionId              // ✅ NEW: session ID for linking uploads
}) {
  const [activeTab, setActiveTab] = useState('upload');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [selectedCamera, setSelectedCamera] = useState('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const sidebarRef = useRef(null);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState('');
  const currentPreviewStreamRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showWatchFromInstructions, setShowWatchFromInstructions] = useState(false);

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
    if (file.size > 1 * 1024 * 1024 * 1024) {
      alert("File must be less than 1GB");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      await uploadMediaToRoom(
        roomId,
        file,
        (percent) => setUploadProgress(percent),
        true, // temporary
        sessionId // ✅ Link upload to session
      );
      
      // ✅ Refresh playlist after successful upload
      // (Poster will be generated in fetchAndGeneratePosters)
      if (onUploadComplete) {
        console.log('📤 [LeftSidebar] Upload complete, refreshing playlist...');
        onUploadComplete();
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); };

  // ✅ PLATFORM LIST (unchanged)
  const platforms = [
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
    { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv' },
    { id: 'crunchyroll', name: 'Crunchyroll', url: 'https://www.crunchyroll.com' },
    { id: 'hdtoday', name: 'HDToday', url: 'https://hdtoday.cc/' },
    { id: 'moviebox', name: 'MovieBox', url: 'https://moviebox.ph/' },
    { id: 'viki', name: 'Viki', url: 'https://www.viki.com' },
    { id: 'tubi', name: 'Tubi', url: 'https://tubitv.com' },
    { id: 'vimeo', name: 'Vimeo', url: 'https://vimeo.com' },
    { id: 'plutotv', name: 'Pluto TV', url: 'https://pluto.tv' },
    { id: 'irokotv', name: 'IrokoTV', url: 'https://irokotv.com' },
    { id: 'showmax', name: 'Showmax', url: 'https://www.showmax.com' },
    { id: 'africamagic', name: 'Africa Magic', url: 'https://www.youtube.com/@AfricaMagic' },
  ];

  const filteredPlatforms = platforms.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ✅ HANDLE PLATFORM SELECTION (metadata only)
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

  // ✅ HANDLE "SHARE SCREEN" FROM WATCH-FROM MODAL
  const handleStartPlatformScreenShare = (platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    const platformName = platform?.name || 'External Screen';

    // 1. Start LiveKit screen share
    if (onStartScreenShare) {
      onStartScreenShare();
    }

    // 2. Notify room of metadata
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

    // 3. Close modal
    setShowWatchFromInstructions(false);
  };

  return (
    <div
      ref={sidebarRef}
      className="fixed left-0 top-0 h-full w-80 z-40 overflow-y-auto hide-scrollbar left-sidebar"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tab Navigation */}
      <div className="p-2 bg-[#D9D9D9]/10 rounded-xl">
        <div className="flex">
          {['upload', 'liveshare', 'watchfrom'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-[107px] h-[43px] flex items-center justify-center text-[15px] font-normal text-gray-400 transition-colors ${
                activeTab === tab
                  ? 'text-black font-black bg-[#D9D9D9]/25 rounded-full'
                  : 'hover:text-white'
              }`}
            >
              {tab === 'upload' && 'Upload'}
              {tab === 'liveshare' && 'LiveShare'}
              {tab === 'watchfrom' && 'Watch From'}
            </button>
          ))}
        </div>
      </div>

      {/* UPLOAD TAB */}
      {activeTab === 'upload' && (
        <div className="flex flex-col h-full">
          <div className="p-4 bg-[#D9D9D9]/10 rounded-b-2xl rounded-t-none mb-4 flex flex-col">
            <div className="flex items-center mb-3">
              <img src="/icons/UploadIcon.svg" alt="Upload" className="h-14 w-12 mr-3" />
              <span className="text-[20px] font-medium text-white">Upload to Playlist</span>
            </div>
            <div
              className="bg-black p-3 rounded-lg flex-1 flex flex-col justify-center"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex items-center mb-3">
                <img src="/icons/FilesIcon.svg" alt="Files" className="h-4 w-4 mr-2" />
                <span className="text-xs text-gray-500">Choose a file or drag & drop</span>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full max-w-[163px] mx-auto px-4 py-2 bg-[#444AF7]/20 text-white rounded-full font-medium text-[15px] hover:bg-[#444AF7]/30 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Browse Files'}
                {uploading && (
                  <div className="w-full mt-3 bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </button>
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

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="h-full flex flex-col p-4 bg-[#D9D9D9]/10 rounded-xl">
              <h4 className="text-base font-semibold text-gray-400 mb-2">PLAYING NOW</h4>
              {currentMedia ? (
                <div className="bg-gray-800 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={currentMedia.poster_url || '/icons/placeholder-poster.jpg'}
                      alt={currentMedia.original_name}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{currentMedia.original_name}</p>
                      <p className="text-gray-400 text-sm">{currentMedia.duration || '00:00'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No media playing</p>
              )}

              <h4 className="text-base font-semibold text-gray-400 mb-2">NEXT UP</h4>
              {playlist.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar">
                  {playlist.map((item) => (
                    <div
                      key={item.ID}
                      className="bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-700 transition-colors flex items-center gap-3"
                      onClick={() => onMediaSelect({ ...item, type: 'upload' })}
                    >
                      <img
                        src={item.poster_url || '/icons/placeholder-poster.jpg'}
                        onError={(e) => e.target.src = '/icons/placeholder-poster.jpg'}
                        alt={item.original_name}
                        className="w-12 h-12 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{item.original_name}</p>
                        <p className="text-gray-400 text-xs">{item.duration}</p>
                      </div>
                      {isHost && (
                        <button
                          className="ml-2 text-red-400 hover:text-red-600"
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
                      )}
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
          <div className="bg-[#D9D9D9]/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <img src="/icons/LiveIcon.svg" alt="Live" className="h-10 w-10" />
              <h3 className="text-white font-medium text-base">Go Live and Share Screen</h3>
            </div>
            <div className="bg-black rounded-lg p-4 mb-4 flex flex-col items-center">
              <p className="text-[#D9D9D9] opacity-25 text-[13px] text-center mb-4">
                Share your screen with others using LiveKit
              </p>
              <button
                onClick={isScreenSharingActive ? onEndScreenShare : onStartScreenShare}
                className={`w-32 py-2 px-4 rounded-full font-medium text-sm transition-colors ${
                  isScreenSharingActive
                    ? 'bg-red-500/25 hover:bg-red-500/30 text-white'
                    : 'bg-[#444AF7]/25 hover:bg-[#444AF7]/30 text-white'
                }`}
              >
                {isScreenSharingActive ? 'End LiveShare' : 'LiveShare'}
              </button>
            </div>
          </div>

          {/* Camera selection (optional, independent of screen share) */}
          <div className="bg-[#D9D9D9]/20 rounded-xl p-4">
            <h3 className="text-white font-bold text-lg text-center mb-3">Choose Camera</h3>
            <div className="bg-black rounded-lg p-3">
              <div className="space-y-3">
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="radio"
                      name="camera"
                      checked={selectedCamera === 'available'}
                      onChange={() => setSelectedCamera('available')}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedCamera === 'available' ? 'border-blue-500 bg-blue-500' : 'border-gray-400'
                    }`}>
                      {selectedCamera === 'available' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm ml-3">Available Camera</span>
                </label>

                {selectedCamera === 'available' && cameraDevices.length > 0 && (
                  <select
                    value={selectedCameraDeviceId}
                    onChange={(e) => {
                      setSelectedCameraDeviceId(e.target.value);
                      handleCameraChange(e.target.value);
                    }}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mt-1"
                  >
                    {cameraDevices.map((device, i) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="radio"
                      name="camera"
                      checked={selectedCamera === 'none'}
                      onChange={() => {
                        setSelectedCamera('none');
                        if (currentPreviewStreamRef.current) {
                          currentPreviewStreamRef.current.getTracks().forEach(t => t.stop());
                          currentPreviewStreamRef.current = null;
                        }
                        if (onCameraPreview) onCameraPreview(null);
                      }}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedCamera === 'none' ? 'border-blue-500 bg-blue-500' : 'border-gray-400'
                    }`}>
                      {selectedCamera === 'none' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm ml-3">No Camera</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WATCH FROM TAB */}
      {activeTab === 'watchfrom' && (
        <div className="p-4 h-full flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">Watch From Platform</h3>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (!searchQuery.trim()) return;
            const matched = platforms.find(p => p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));
            const url = matched ? matched.url : `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
            window.open(url, '_blank');
            setSearchQuery('');
          }} className="mb-4">
            <input
              type="text"
              placeholder="Search platforms or browse the web..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button type="submit" className="mt-2 w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-medium">
              Go →
            </button>
          </form>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-2 gap-4">
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

      {/* MODAL: Watch From Instructions */}
      {showWatchFromInstructions && (
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
    </div>
  );
}