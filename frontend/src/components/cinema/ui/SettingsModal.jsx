// frontend/src/components/cinema/ui/SettingsModal.jsx
import React, { useState } from 'react';

const ShareIcon = '/icons/ShareIcon.svg';
const UserIcon = '/icons/user1avatar.svg';

const SettingsModal = ({
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
  roomMembers,
  handleSeatSelect,
  isViewLocked,
  setIsViewLocked,
  lightsOn,
  setLightsOn,
  // ✅ NEW: User Profile
  onOpenUserProfile,
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
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="max-h-[70vh] overflow-y-auto">
          {/* Share Room */}
          <div className="px-6 py-4 border-b border-gray-700">
            <button
              onClick={() => {
                onShareRoom();
                onClose();
              }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-200 transition-colors"
            >
              <img src={ShareIcon} alt="Share" className="w-6 h-6" />
              <span className="text-base font-medium">Share Room</span>
            </button>
          </div>

          {/* User Profile */}
          <div className="px-6 py-4 border-b border-gray-700">
            <button
              onClick={() => {
                onOpenUserProfile?.();
                onClose();
              }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-200 transition-colors"
            >
              <img src={UserIcon} alt="Profile" className="w-6 h-6" />
              <span className="text-base font-medium">User Profile</span>
            </button>
          </div>

          {/* Seat Markers Toggle */}
          <div className="px-6 py-4 border-b border-gray-700">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-200 text-base font-medium">Show Seat Markers</span>
              <button
                onClick={() => onToggleSeatMarkers?.(!showSeatMarkers)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showSeatMarkers ? 'bg-blue-600' : 'bg-gray-600'
                }`}
                aria-label="Toggle seat markers"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showSeatMarkers ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* 🎮 SEAT & VIEW CONTROLS (COLLAPSIBLE) */}
          <div className="px-6 py-4 border-b border-gray-700">
            <button
              onClick={() => setSeatViewExpanded(!seatViewExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-200 transition-colors"
            >
              <span className="text-base font-medium">🎮 Seat & View Controls</span>
              <span className="text-xl">{seatViewExpanded ? '▼' : '▶'}</span>
            </button>
            
            {seatViewExpanded && (
              <div className="mt-4 space-y-4">
                {/* 🪑 SEAT CONTROLS SECTION */}
                <div>
                  <h3 className="text-sm font-semibold text-yellow-400 mb-3">🪑 Seat Controls</h3>
            
            {/* Go to Seat Input */}
            <div className="mb-3">
              <label className="text-xs text-gray-300 block mb-1">Go to Seat (1–42):</label>
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
                  className="bg-gray-800 text-white px-2 py-1 rounded w-16 text-xs"
                />
                <button
                  onClick={() => {
                    const randomSeat = Math.floor(Math.random() * 42) + 1;
                    goToSeatNumber(randomSeat);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs"
                >
                  Random
                </button>
              </div>
            </div>

            {/* Quick Jump Buttons */}
            <div>
              <div className="text-xs text-gray-300 mb-2">Quick Jump:</div>
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

                  <div className="mt-2 text-[10px] text-gray-400">
                    <p>⭐ = Premium middle seats</p>
                  </div>
                </div>

                {/* 🎮 VIEW CONTROLS SECTION */}
                <div className="pt-4 border-t border-gray-700">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">🎮 View Controls</h3>
                  
                  <button
                    onClick={() => setIsViewLocked(!isViewLocked)}
                    className={`w-full mb-2 px-4 py-2 rounded font-medium transition-colors ${
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

                  <div className="mt-3 pt-2 border-t border-gray-700 text-[10px] text-gray-400">
                    <p className="font-bold text-white mb-1">🎭 Avatar System:</p>
                    <p>• {roomMembers?.length || 0} users in cinema</p>
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

          {/* Position Debug Toggle */}
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