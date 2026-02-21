// frontend/src/components/cinema/ui/SettingsModal.jsx
import React, { useState } from 'react';

const ShareIcon = '/icons/ShareIcon.svg';
const UserIcon = '/icons/user1avatar.svg';

const SettingsModal = ({
  watchType = 'video',
  isOpen,
  onClose,
  onShareRoom,
  audioDevices = [],
  selectedAudioDeviceId,
  showPositionDebug,
  onTogglePositionDebug,
  onAudioDeviceChange,
  availableCameras = [],
  selectedCameraId,
  onCameraSwitch,
  // Seat markers
  showSeatMarkers,
  onToggleSeatMarkers,
  // ✅ NEW: Seat & View Controls
  currentUser,
  userSeats,
  watchSessionMembers,
  handleSeatSelect,
  isViewLocked,
  setIsViewLocked,
  lightsOn,
  setLightsOn,
  // ✅ NEW: User Profile
  onOpenUserProfile,
  // ✅ NEW: Lecture Hall Settings
  showDebugPanels,
  onToggleDebugPanels,
  freeRoamMode,
  setFreeRoamMode,
  lockMovement,
  setLockMovement,
  lockOrbit,
  setLockOrbit,
  showPreview,
  setShowPreview,
  showAvatars,
  setShowAvatars,
  showCameraMarkers,
  setShowCameraMarkers,
  showPositionDebugLectureHall,
  onTogglePositionDebugLectureHall,
  showAudioDebugPanel,
  onToggleAudioDebugPanel,
  showViewDirectionModal,
  onToggleViewDirectionModal,
  onExportCameraPositions,
  savedCameraPositionsCount = 0,
  // Keyboard Movement
  freeCameraMovement,
  setFreeCameraMovement,
  // Demo Mode
  demoMode,
  setDemoMode,
  // Chat Bubble Visibility
  showChatBubbles = true,
  onToggleChatBubbles,
}) => {
  if (!isOpen) return null;

  const [seatInput, setSeatInput] = useState('1');
  const [seatViewExpanded, setSeatViewExpanded] = useState(false);

  const handleSeatInputChange = (e) => {
    let val = e.target.value;
    if (val === '') {
      setSeatInput('');
      return;
    }
    let num = parseInt(val, 10);
    if (isNaN(num)) num = 1;
    if (num < 1) num = 1;
    if (num > 42) num = 42;
    setSeatInput(num.toString());
  };

  const goToSeatNumber = (seatNum) => {
    const row = Math.floor((seatNum - 1) / 7);
    const col = (seatNum - 1) % 7;
    handleSeatSelect(`${row}-${col}`);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center pb-24 settings-modal-content">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-700/50 bg-gradient-to-r from-gray-800 to-gray-850">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-blue-500 rounded-full"></div>
            <h2 className="text-xl font-bold text-white tracking-tight">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-full w-8 h-8 flex items-center justify-center transition-all text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* SECTION: Quick Actions */}
          <div className="px-6 py-4 bg-gray-800/30">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  onShareRoom();
                  onClose();
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-gray-700/50 text-gray-200 transition-all group bg-gray-800/50 border border-gray-700/30"
              >
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <img src={ShareIcon} alt="Share" className="w-5 h-5" />
                </div>
                <div className="flex-1 text-left">
                  <span className="text-sm font-semibold block">Share Room</span>
                  <span className="text-xs text-gray-400">Invite others to join</span>
                </div>
                <span className="text-gray-500 group-hover:text-gray-300 transition-colors">→</span>
              </button>

              <button
                onClick={() => {
                  onOpenUserProfile?.();
                  onClose();
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-gray-700/50 text-gray-200 transition-all group bg-gray-800/50 border border-gray-700/30"
              >
                <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <img src={UserIcon} alt="Profile" className="w-5 h-5" />
                </div>
                <div className="flex-1 text-left">
                  <span className="text-sm font-semibold block">User Profile</span>
                  <span className="text-xs text-gray-400">View and edit profile</span>
                </div>
                <span className="text-gray-500 group-hover:text-gray-300 transition-colors">→</span>
              </button>
            </div>
          </div>

          {/* SECTION: Display Preferences */}
          {watchType === '3d_cinema' && (
            <div className="px-6 py-4 bg-gray-800/20 border-t border-gray-700/30">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Display Preferences</h3>
              <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl p-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-gray-200 block">Chat Bubble Visibility</span>
                    <span className="text-xs text-gray-400 mt-0.5 block">Show chat messages above avatars</span>
                  </div>
                  <button
                    onClick={() => onToggleChatBubbles?.()}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all shadow-inner ml-4 ${
                      showChatBubbles ? 'bg-blue-600' : 'bg-gray-600'
                    }`}
                    aria-label="Toggle chat bubbles"
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        showChatBubbles ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>
          )}

          {/* SECTION: Advanced Controls - 3D Cinema & Super Admin Only */}
          {watchType === '3d_cinema' && currentUser?.role === 'super_admin' && (
            <div className="px-6 py-4 bg-gray-800/30 border-t border-gray-700/30">
              <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
                Admin Controls
              </h3>
              <div className="space-y-3">
                {/* Seat Markers */}
                <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl p-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-gray-200 block">Show Seat Markers</span>
                      <span className="text-xs text-gray-400 mt-0.5 block">Display seat position guides</span>
                    </div>
                    <button
                      onClick={() => onToggleSeatMarkers?.(!showSeatMarkers)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all shadow-inner ml-4 ${
                        showSeatMarkers ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle seat markers"
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          showSeatMarkers ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {/* Position Debug */}
                <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl p-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-gray-200 block">Show Position Debug</span>
                      <span className="text-xs text-gray-400 mt-0.5 block">Display debug coordinates</span>
                    </div>
                    <button
                      onClick={() => onTogglePositionDebug?.(!showPositionDebug)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all shadow-inner ml-4 ${
                        showPositionDebug ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle position debug"
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          showPositionDebug ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: Seat & View Controls - 3D Cinema & Super Admin Only */}
          {watchType === '3d_cinema' && currentUser?.role === 'super_admin' && (
            <div className="px-6 py-4 bg-gray-800/20 border-t border-gray-700/30">
              <button
                onClick={() => setSeatViewExpanded(!seatViewExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-700/50 text-gray-200 transition-all bg-gray-800/50 border border-gray-700/30 group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎮</span>
                  <div className="text-left">
                    <span className="text-sm font-semibold block">Seat & View Controls</span>
                    <span className="text-xs text-gray-400">Position and camera settings</span>
                  </div>
                </div>
                <span className="text-xl text-gray-500 group-hover:text-gray-300 transition-colors">{seatViewExpanded ? '▼' : '▶'}</span>
              </button>
              
            {seatViewExpanded && (
              <div className="mt-4 space-y-4 px-4">
                {/* 🪑 SEAT CONTROLS SECTION */}
                <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                    <span>🪑</span> Seat Controls
                  </h3>
            
            {/* Go to Seat Input */}
            <div className="mb-3">
              <label className="text-xs text-gray-300 block mb-2 font-medium">Go to Seat (1–42):</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  min="1" 
                  max="42"
                  value={seatInput}
                  onChange={handleSeatInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      goToSeatNumber(parseInt(seatInput) || 1);
                    }
                  }}
                  className="flex-1 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm border border-gray-700 focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="Enter seat #"
                />
                <button
                  onClick={() => {
                    const randomSeat = Math.floor(Math.random() * 42) + 1;
                    goToSeatNumber(randomSeat);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-md hover:shadow-lg"
                >
                  🎲 Random
                </button>
              </div>
            </div>

            {/* Quick Jump Buttons */}
            <div>
              <div className="text-xs text-gray-300 mb-2 font-medium">Quick Jump:</div>
              <div className="grid grid-cols-3 gap-2">{[
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
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all shadow-sm hover:shadow-md ${
                      seat.color === 'yellow'
                        ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                    }`}
                  >
                    {seat.label}
                  </button>
                ))}
              </div>
            </div>

                  <div className="mt-3 pt-3 border-t border-gray-700/50 text-[10px] text-gray-400">
                    <p>⭐ = Premium middle seats with optimal viewing angles</p>
                  </div>
                </div>

                {/* 🎮 VIEW CONTROLS SECTION */}
                <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                    <span>🎮</span> View Controls
                  </h3>
                  
                  <div className="space-y-3">
                    <button
                      onClick={() => setIsViewLocked(!isViewLocked)}
                      className={`w-full px-4 py-3 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg ${
                        isViewLocked 
                          ? 'bg-red-600 hover:bg-red-700 text-white' 
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {isViewLocked ? '🔒 View Locked' : '🔓 View Unlocked'}
                    </button>

                    <button
                      onClick={() => setLightsOn(!lightsOn)}
                      className={`w-full px-4 py-3 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg ${
                        lightsOn 
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                          : 'bg-gray-700 hover:bg-gray-600 text-white'
                      }`}
                    >
                      {lightsOn ? '💡 Lights On' : '🌑 Lights Off'}
                    </button>
                  </div>

                  <div className="mt-3 pt-2 border-t border-gray-700 text-[10px] text-gray-400">
                    <p className="font-bold text-white mb-1">🎭 Avatar System:</p>
                    <p>• {watchSessionMembers?.length || 0} users in cinema</p>
                    <p>• Rayman-style floating hands</p>
                    <p>• White gloves with colored glow</p>
                    <p>• Breathing & look-around animations</p>
                  </div>

                  <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-400">
                    <p className="font-bold text-white mb-1">😊 Emote Controls:</p>
                    <p>• Press 1: 👋 Wave</p>
                    <p>• Press 2: 👏 Clap</p>
                    <p>• Press 3: 👍 Thumbs Up</p>
                    <p>• Press 4: 😂 Laugh</p>
                    <p>• Press 5: ❤️ Heart</p>
                  </div>

                  <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-400">
                    <p className="font-bold text-white mb-1">🔒 Locked Mode (Seated):</p>
                    <p>• WASD / Arrow Keys: Look around</p>
                    <p>• L/C/R: Look left/center/right</p>
                    <p>• Position locked to seat</p>
                    
                    <p className="font-bold text-white mt-2 mb-1">🔓 Unlocked Mode (Free Roam):</p>
                    <p>• WASD: Move</p>
                    <p>• Q/E: Move up/down</p>
                    <p>• Arrow Keys: Pan view</p>
                    <p>• 1-6: Snap to axis views</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Position Debug Toggle - 3D Cinema & Super Admin Only */}
          {watchType === '3d_cinema' && currentUser?.role === 'super_admin' && (
            <div className="px-6 py-4 border-b border-gray-700">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-gray-200 text-base font-medium">Show Position Debug</span>
                <button
                  onClick={() => onTogglePositionDebug?.(!showPositionDebug)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    showPositionDebug ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                  aria-label="Toggle position debug"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      showPositionDebug ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>
          )}

          {/* Lecture Hall Settings - Super Admin Only */}
          {currentUser?.role === 'super_admin' && (typeof showDebugPanels !== 'undefined' || typeof showPositionDebugLectureHall !== 'undefined') && (
            <div className="px-6 py-4 border-b border-gray-700">
              <div className="space-y-4">
                <h3 className="text-base font-medium text-white">🏛️ Lecture Hall Settings</h3>
                
                {/* Demo Mode (145 Avatars) */}
                {typeof demoMode !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex flex-col">
                      <span className="text-gray-200 text-sm">🧪 Demo Mode (145 Avatars)</span>
                      <span className="text-gray-400 text-xs">Populate all seats with test avatars</span>
                    </div>
                    <button
                      onClick={() => setDemoMode?.(!demoMode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        demoMode ? 'bg-orange-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle demo mode"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          demoMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}
                
                {/* Keyboard Movement (WASDCV) */}
                {typeof freeCameraMovement !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">🎮 Keyboard Movement</span>
                    <button
                      onClick={() => setFreeCameraMovement?.(!freeCameraMovement)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        freeCameraMovement ? 'bg-green-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle keyboard movement"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          freeCameraMovement ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}
                
                {/* Show Position Debug - Lecture Hall */}
                {typeof showPositionDebugLectureHall !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">Show Position Debug - Lecture Hall</span>
                    <button
                      onClick={() => onTogglePositionDebugLectureHall?.(!showPositionDebugLectureHall)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showPositionDebugLectureHall ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle position debug for lecture hall"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showPositionDebugLectureHall ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Audio Debug Panel */}
                {typeof showAudioDebugPanel !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">🔍 Audio Debug Panel</span>
                    <button
                      onClick={() => onToggleAudioDebugPanel?.(!showAudioDebugPanel)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showAudioDebugPanel ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle audio debug panel"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showAudioDebugPanel ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Show Debug Panels */}
                {typeof showDebugPanels !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">Show Debug Panels</span>
                    <button
                      onClick={() => onToggleDebugPanels?.(!showDebugPanels)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showDebugPanels ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle debug panels"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showDebugPanels ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Show View Direction Modal */}
                {typeof showViewDirectionModal !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">👁️ View Direction Controls</span>
                    <button
                      onClick={() => onToggleViewDirectionModal?.(!showViewDirectionModal)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showViewDirectionModal ? 'bg-purple-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle view direction modal"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showViewDirectionModal ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Export Camera Positions */}
                {typeof onExportCameraPositions !== 'undefined' && (
                  <button
                    onClick={() => {
                      onExportCameraPositions?.();
                      onClose();
                    }}
                    className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={savedCameraPositionsCount === 0}
                  >
                    📦 Export Camera Positions ({savedCameraPositionsCount})
                  </button>
                )}

                {/* Free Roam Mode */}
                {typeof freeRoamMode !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">🎮 Free Roam Mode</span>
                    <button
                      onClick={() => setFreeRoamMode?.(!freeRoamMode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        freeRoamMode ? 'bg-orange-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle free roam mode"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          freeRoamMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Lock Movement */}
                {typeof lockMovement !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">🔒 Lock Movement</span>
                    <button
                      onClick={() => setLockMovement?.(!lockMovement)}
                      disabled={freeRoamMode}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        lockMovement ? 'bg-red-600' : 'bg-gray-600'
                      } disabled:opacity-50`}
                      aria-label="Toggle lock movement"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          lockMovement ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Lock Orbit */}
                {typeof lockOrbit !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">🔒 Lock Orbit</span>
                    <button
                      onClick={() => setLockOrbit?.(!lockOrbit)}
                      disabled={freeRoamMode}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        lockOrbit ? 'bg-blue-600' : 'bg-gray-600'
                      } disabled:opacity-50`}
                      aria-label="Toggle lock orbit"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          lockOrbit ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Show Preview (Seat Markers) */}
                {typeof showPreview !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">✓ Seat Markers</span>
                    <button
                      onClick={() => setShowPreview?.(!showPreview)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showPreview ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle seat markers"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showPreview ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Show Avatars */}
                {typeof showAvatars !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">👤 Avatars</span>
                    <button
                      onClick={() => setShowAvatars?.(!showAvatars)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showAvatars ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle avatars"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showAvatars ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}

                {/* Show Camera Markers */}
                {typeof showCameraMarkers !== 'undefined' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-gray-200 text-sm">✓ Camera Markers</span>
                    <button
                      onClick={() => setShowCameraMarkers?.(!showCameraMarkers)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showCameraMarkers ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                      aria-label="Toggle camera markers"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showCameraMarkers ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Audio Device Selection */}
          {audioDevices.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Microphone</h3>
              <div className="space-y-1">
                {audioDevices.map((device) => (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      onAudioDeviceChange(device.deviceId);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-800 flex items-center justify-between transition-colors ${
                      selectedAudioDeviceId === device.deviceId ? 'bg-gray-800 text-green-400' : 'text-gray-300'
                    }`}
                  >
                    <span className="truncate pr-2 text-sm">{device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}</span>
                    {selectedAudioDeviceId === device.deviceId && <span className="text-green-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}  

          {/* Camera Device Selection */}
          {availableCameras.length > 0 && (
            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Camera</h3>
              <div className="space-y-1">
                {availableCameras.map((camera, index) => (
                  <button
                    key={camera.deviceId}
                    onClick={() => {
                      onCameraSwitch(camera.deviceId);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-800 flex items-center justify-between transition-colors ${
                      selectedCameraId === camera.deviceId ? 'bg-gray-800 text-green-400' : 'text-gray-300'
                    }`}
                  >
                    <span className="truncate pr-2 text-sm">{camera.label || `Camera ${index + 1}`}</span>
                    {selectedCameraId === camera.deviceId && <span className="text-green-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;